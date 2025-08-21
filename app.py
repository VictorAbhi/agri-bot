import os
import traceback
import json
from flask import Flask, render_template, request, jsonify, Response, g
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

from src.supabase_client import SupabaseManager
from src.auth_middleware import init_auth_middleware

require_auth = init_auth_middleware(app)

supabase_manager = SupabaseManager()

class AgriBotSystem:
    def __init__(self):
        self.initialized = False
        self.error = None
        self.conversation_chain = None
        self.initialize()

    def initialize(self):
        """Initialize the RAG system with proper error handling"""
        try:
            from langchain.memory import ConversationBufferWindowMemory, ChatMessageHistory
            from langchain_pinecone import PineconeVectorStore
            from langchain_community.embeddings import HuggingFaceEmbeddings
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain.chains import ConversationalRetrievalChain
            from langchain_core.prompts import ChatPromptTemplate

            # Verify API keys
            GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
            PINECONE_API_KEY = os.getenv('PINECONE_API_KEY')
            
            if not GOOGLE_API_KEY or not PINECONE_API_KEY:
                raise ValueError("Missing required API keys (GOOGLE_API_KEY, PINECONE_API_KEY)")

            # Initialize embeddings
            embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2",
                model_kwargs={'device': 'cpu'}
            )

            # Initialize vector store
            vector_store = PineconeVectorStore.from_existing_index(
                embedding=embeddings,
                index_name="agri-bot"
            )

            # Initialize LLM
            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                temperature=0.7,
                google_api_key=GOOGLE_API_KEY
            )

            # Configure memory
            message_history = ChatMessageHistory()
            memory = ConversationBufferWindowMemory(
                memory_key="chat_history",
                output_key="answer",
                chat_memory=message_history,
                return_messages=True,
                k=3
            )

            # Create prompt template
            system_prompt = (
                "You are AgriBot, an expert agricultural assistant specializing in crop disease diagnosis. "
                "Provide detailed, accurate information about symptoms, causes, prevention, and treatment. "
                "Always cite specific details from the provided context. If unsure, say you don't know.\n\n"
                "Context:\n{context}\n\n"
                "Question: {question}"
            )

            # Create conversation chain
            self.conversation_chain = ConversationalRetrievalChain.from_llm(
                llm=llm,
                retriever=vector_store.as_retriever(search_kwargs={"k": 3}),
                memory=memory,
                verbose=True,
                chain_type="stuff",
                combine_docs_chain_kwargs={
                    "prompt": ChatPromptTemplate.from_template(system_prompt)
                }
            )

            self.initialized = True
            print("✓ AgriBot RAG system initialized successfully")

        except Exception as e:
            self.error = str(e)
            print(f"✗ Failed to initialize AgriBot: {self.error}")
            if self.conversation_chain is None:
                print("⚠️ Running in fallback mode without RAG capabilities")

    def get_response_stream(self, query):
        """Get streaming response from the RAG system with token-level streaming"""
        if not query or not query.strip():
            yield "data: " + json.dumps({"content": "Please provide a valid question about agriculture or crop diseases.", "done": True}) + "\n\n"
            return

        try:
            if not self.initialized:
                yield "data: " + json.dumps({"content": "AgriBot is currently initializing. I can answer basic questions about crop diseases, but advanced features are unavailable. Please try again later.", "done": True}) + "\n\n"
                return

            # Get relevant documents first
            retriever = self.conversation_chain.retriever
            docs = retriever.invoke(query.strip())
            
            # Create context from retrieved documents
            context = "\n\n".join([doc.page_content for doc in docs])
            
            # Create the prompt with context
            system_prompt = (
                "You are AgriBot, an expert agricultural assistant specializing in crop disease diagnosis. "
                "Provide detailed, accurate information about symptoms, causes, prevention, and treatment. "
                "Always cite specific details from the provided context. If unsure, say you don't know.\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {query.strip()}"
            )
            
            # Access the LLM correctly from the conversation chain
            llm = self.conversation_chain.combine_docs_chain.llm_chain.llm
            
            # Stream the response token by token
            for chunk in llm.stream(system_prompt):
                if hasattr(chunk, 'content') and chunk.content:
                    yield "data: " + json.dumps({"content": chunk.content, "done": False}) + "\n\n"
            
            # Send final completion signal
            yield "data: " + json.dumps({"content": "", "done": True}) + "\n\n"

        except Exception as e:
            print(f"Error processing streaming query: {str(e)}")
            error_response = ("I encountered an error while processing your question. "
                           "Please try asking about specific crop diseases like tomato blight or wheat rust.")
            yield "data: " + json.dumps({"content": error_response, "done": True}) + "\n\n"

    def get_response(self, query):
        """Get response from the RAG system with proper error handling"""
        if not query or not query.strip():
            return "Please provide a valid question about agriculture or crop diseases."

        try:
            if not self.initialized:
                return ("AgriBot is currently initializing. I can answer basic questions about crop diseases, "
                       "but advanced features are unavailable. Please try again later.")

            # Process the query
            response = self.conversation_chain.invoke({"question": query.strip()})
            
            if not response or 'answer' not in response:
                return "I couldn't generate a response. Please try asking about specific crop diseases or symptoms."
            
            return response['answer']

        except Exception as e:
            print(f"Error processing query: {str(e)}")
            return ("I encountered an error while processing your question. "
                   "Please try asking about specific crop diseases like tomato blight or wheat rust.")

# Initialize the AgriBot system
agri_bot = AgriBotSystem()

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """User registration endpoint"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['email', 'password', 'full_name']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Create user account
        result = supabase_manager.create_user(
            email=data['email'],
            password=data['password'],
            full_name=data['full_name'],
            phone=data.get('phone'),
            location=data.get('location'),
            farm_type=data.get('farm_type'),
            experience_level=data.get('experience_level', 'beginner'),
            preferred_crops=data.get('preferred_crops', [])
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'user_id': result['user_id']
            }), 201
        else:
            return jsonify({'error': result['message']}), 400
            
    except Exception as e:
        print(f"Signup error: {str(e)}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Authenticate user
        result = supabase_manager.authenticate_user(
            email=data['email'],
            password=data['password']
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'token': result['token'],
                'user': result['user_profile']
            }), 200
        else:
            return jsonify({'error': result['message']}), 401
            
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/profile', methods=['GET'])
@require_auth
def get_profile():
    """Get current user profile"""
    try:
        return jsonify({
            'success': True,
            'user': g.current_user
        }), 200
    except Exception as e:
        print(f"Profile error: {str(e)}")
        return jsonify({'error': 'Failed to get profile'}), 500

@app.route('/api/auth/profile', methods=['PUT'])
@require_auth
def update_profile():
    """Update user profile"""
    try:
        data = request.get_json()
        
        # Remove fields that shouldn't be updated directly
        protected_fields = ['id', 'created_at']
        for field in protected_fields:
            data.pop(field, None)
        
        success = supabase_manager.update_user_profile(g.current_user_id, data)
        
        if success:
            # Get updated profile
            updated_profile = supabase_manager.get_user_profile(g.current_user_id)
            return jsonify({
                'success': True,
                'message': 'Profile updated successfully',
                'user': updated_profile
            }), 200
        else:
            return jsonify({'error': 'Failed to update profile'}), 400
            
    except Exception as e:
        print(f"Profile update error: {str(e)}")
        return jsonify({'error': 'Profile update failed'}), 500

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    """User logout endpoint"""
    try:
        # In a JWT-based system, logout is typically handled client-side
        # by removing the token. We can add token blacklisting here if needed.
        return jsonify({
            'success': True,
            'message': 'Logged out successfully'
        }), 200
    except Exception as e:
        print(f"Logout error: {str(e)}")
        return jsonify({'error': 'Logout failed'}), 500

@app.route('/api/conversations', methods=['GET'])
@require_auth
def get_conversations():
    """Get all conversations for the current user"""
    try:
        conversations = supabase_manager.get_user_conversations(g.current_user_id)
        return jsonify({
            'success': True,
            'conversations': conversations
        }), 200
    except Exception as e:
        print(f"Get conversations error: {str(e)}")
        return jsonify({'error': 'Failed to get conversations'}), 500

@app.route('/api/conversations', methods=['POST'])
@require_auth
def create_conversation():
    """Create a new conversation"""
    try:
        data = request.get_json()
        title = data.get('title', 'New Conversation')
        
        conversation_id = supabase_manager.create_conversation(
            user_id=g.current_user_id,
            title=title
        )
        
        if conversation_id:
            return jsonify({
                'success': True,
                'conversation_id': conversation_id,
                'message': 'Conversation created successfully'
            }), 201
        else:
            return jsonify({'error': 'Failed to create conversation'}), 400
            
    except Exception as e:
        print(f"Create conversation error: {str(e)}")
        return jsonify({'error': 'Failed to create conversation'}), 500

@app.route('/api/conversations/<conversation_id>', methods=['PUT'])
@require_auth
def update_conversation(conversation_id):
    """Update conversation title"""
    try:
        data = request.get_json()
        title = data.get('title')
        
        if not title:
            return jsonify({'error': 'Title is required'}), 400
        
        success = supabase_manager.update_conversation_title(conversation_id, title)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Conversation updated successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to update conversation'}), 400
            
    except Exception as e:
        print(f"Update conversation error: {str(e)}")
        return jsonify({'error': 'Failed to update conversation'}), 500

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
@require_auth
def delete_conversation(conversation_id):
    """Delete a conversation and all its messages"""
    try:
        success = supabase_manager.delete_conversation(conversation_id, g.current_user_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Conversation deleted successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to delete conversation'}), 400
            
    except Exception as e:
        print(f"Delete conversation error: {str(e)}")
        return jsonify({'error': 'Failed to delete conversation'}), 500

@app.route('/api/conversations/<conversation_id>/messages', methods=['GET'])
@require_auth
def get_conversation_messages(conversation_id):
    """Get all messages for a specific conversation"""
    try:
        messages = supabase_manager.get_conversation_messages(conversation_id)
        return jsonify({
            'success': True,
            'messages': messages
        }), 200
    except Exception as e:
        print(f"Get messages error: {str(e)}")
        return jsonify({'error': 'Failed to get messages'}), 500

@app.route('/api/messages/recent', methods=['GET'])
@require_auth
def get_recent_messages():
    """Get recent messages for the current user across all conversations"""
    try:
        limit = request.args.get('limit', 50, type=int)
        messages = supabase_manager.get_recent_messages(g.current_user_id, limit)
        return jsonify({
            'success': True,
            'messages': messages
        }), 200
    except Exception as e:
        print(f"Get recent messages error: {str(e)}")
        return jsonify({'error': 'Failed to get recent messages'}), 500

@app.route('/api/messages/<message_id>', methods=['PUT'])
@require_auth
def update_message(message_id):
    """Update a message response"""
    try:
        data = request.get_json()
        response = data.get('response')
        
        if not response:
            return jsonify({'error': 'Response is required'}), 400
        
        success = supabase_manager.update_message_response(message_id, response)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Message updated successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to update message'}), 400
            
    except Exception as e:
        print(f"Update message error: {str(e)}")
        return jsonify({'error': 'Failed to update message'}), 500

@app.route('/api/search/conversations', methods=['GET'])
@require_auth
def search_conversations():
    """Search conversations by title or content"""
    try:
        query = request.args.get('q', '').strip()
        
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
        
        # Get all user conversations and filter by title
        conversations = supabase_manager.get_user_conversations(g.current_user_id)
        filtered_conversations = [
            conv for conv in conversations 
            if query.lower() in conv.get('title', '').lower()
        ]
        
        return jsonify({
            'success': True,
            'conversations': filtered_conversations,
            'query': query
        }), 200
        
    except Exception as e:
        print(f"Search conversations error: {str(e)}")
        return jsonify({'error': 'Failed to search conversations'}), 500

@app.route('/api/search/messages', methods=['GET'])
@require_auth
def search_messages():
    """Search messages by content"""
    try:
        query = request.args.get('q', '').strip()
        limit = request.args.get('limit', 20, type=int)
        
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
        
        # Get recent messages and filter by content
        messages = supabase_manager.get_recent_messages(g.current_user_id, limit * 3)  # Get more to filter
        filtered_messages = [
            msg for msg in messages 
            if (query.lower() in msg.get('question', '').lower() or 
                query.lower() in (msg.get('response') or '').lower())
        ][:limit]
        
        return jsonify({
            'success': True,
            'messages': filtered_messages,
            'query': query
        }), 200
        
    except Exception as e:
        print(f"Search messages error: {str(e)}")
        return jsonify({'error': 'Failed to search messages'}), 500

@app.route('/api/stats/user', methods=['GET'])
@require_auth
def get_user_stats():
    """Get user statistics (conversation count, message count, etc.)"""
    try:
        conversations = supabase_manager.get_user_conversations(g.current_user_id)
        recent_messages = supabase_manager.get_recent_messages(g.current_user_id, 1000)
        
        stats = {
            'total_conversations': len(conversations),
            'total_messages': len(recent_messages),
            'recent_activity': len([msg for msg in recent_messages if msg.get('created_at')]) > 0
        }
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        print(f"Get user stats error: {str(e)}")
        return jsonify({'error': 'Failed to get user statistics'}), 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chat/stream', methods=["POST"])
@require_auth  # Require authentication for chat
def get_bot_response_stream():
    """API endpoint for streaming chat messages"""
    try:
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
            user_query = data.get('message', '').strip()
            conversation_id = data.get('conversation_id')
        else:
            user_query = request.form.get('msg', '').strip()
            conversation_id = request.form.get('conversation_id')
        
        if not user_query:
            return jsonify({"error": "Please enter a question"}), 400
        
        if not conversation_id:
            conversation_id = supabase_manager.create_conversation(
                user_id=g.current_user_id,
                title=user_query[:50] + "..." if len(user_query) > 50 else user_query
            )
        
        message_id = supabase_manager.save_message(
            conversation_id=conversation_id,
            user_id=g.current_user_id,
            question=user_query
        )
        
        def generate():
            yield "data: " + json.dumps({"content": "", "done": False, "start": True, "conversation_id": conversation_id, "message_id": message_id}) + "\n\n"
            
            full_response = ""
            for chunk in agri_bot.get_response_stream(user_query):
                chunk_data = json.loads(chunk.replace("data: ", ""))
                if chunk_data.get("content"):
                    full_response += chunk_data["content"]
                yield chunk
            
            if message_id and full_response:
                supabase_manager.update_message_response(message_id, full_response)
        
        return Response(generate(), mimetype='text/event-stream', headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
        })

    except Exception as e:
        print(f"Streaming API Error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": "An internal error occurred",
            "answer": "I'm having technical difficulties. Please try again later."
        }), 500

@app.route('/api/chat', methods=["POST"])
@require_auth  # Require authentication for chat
def get_bot_response():
    """API endpoint for chat messages - accepts both JSON and form data"""
    try:
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
            user_query = data.get('message', '').strip()
            conversation_id = data.get('conversation_id')
        else:
            user_query = request.form.get('msg', '').strip()
            conversation_id = request.form.get('conversation_id')
        
        if not user_query:
            return jsonify({"error": "Please enter a question"}), 400
        
        if not conversation_id:
            conversation_id = supabase_manager.create_conversation(
                user_id=g.current_user_id,
                title=user_query[:50] + "..." if len(user_query) > 50 else user_query
            )
        
        response = agri_bot.get_response(user_query)
        
        message_id = supabase_manager.save_message(
            conversation_id=conversation_id,
            user_id=g.current_user_id,
            question=user_query,
            response=response
        )
        
        return jsonify({
            "answer": response,
            "conversation_id": conversation_id,
            "message_id": message_id
        })

    except Exception as e:
        print(f"API Error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": "An internal error occurred",
            "answer": "I'm having technical difficulties. Please try again later."
        }), 500

@app.route('/health')
def health_check():
    """Comprehensive health check endpoint"""
    status = {
        'status': 'healthy' if agri_bot.initialized else 'degraded',
        'rag_available': agri_bot.initialized,
        'initialization_error': agri_bot.error,
        'environment_loaded': bool(os.getenv('GOOGLE_API_KEY') and os.getenv('PINECONE_API_KEY')),
        'supabase_configured': bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_ANON_KEY'))
    }
    return jsonify(status)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
