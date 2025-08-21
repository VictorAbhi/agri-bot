import os
from supabase import create_client, Client
from typing import Optional, Dict, Any, List
import bcrypt
import jwt
from datetime import datetime, timedelta
import uuid

class SupabaseManager:
    def __init__(self):
        """Initialize Supabase client"""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_ANON_KEY')
        self.jwt_secret = os.getenv('JWT_SECRET', 'your-secret-key')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    
    def generate_jwt_token(self, user_id: str) -> str:
        """Generate JWT token for user authentication"""
        payload = {
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(days=7)
        }
        return jwt.encode(payload, self.jwt_secret, algorithm='HS256')
    
    def verify_jwt_token(self, token: str) -> Optional[str]:
        """Verify JWT token and return user_id"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=['HS256'])
            return payload.get('user_id')
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    # User Management
    def create_user(self, email: str, password: str, full_name: str, **kwargs) -> Dict[str, Any]:
        """Create a new user account"""
        try:
            # First create auth user
            auth_response = self.supabase.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if auth_response.user:
                user_id = auth_response.user.id
                
                # Create user profile
                user_data = {
                    'id': user_id,
                    'full_name': full_name,
                    'phone': kwargs.get('phone'),
                    'location': kwargs.get('location'),
                    'farm_type': kwargs.get('farm_type'),
                    'experience_level': kwargs.get('experience_level', 'beginner'),
                    'theme': kwargs.get('theme', 'light'),
                    'language': kwargs.get('language', 'en'),
                    'preferred_crops': kwargs.get('preferred_crops', [])
                }
                
                profile_response = self.supabase.table('users').insert(user_data).execute()
                
                return {
                    'success': True,
                    'user_id': user_id,
                    'message': 'User created successfully'
                }
            else:
                return {
                    'success': False,
                    'message': 'Failed to create user account'
                }
                
        except Exception as e:
            return {
                'success': False,
                'message': f'Error creating user: {str(e)}'
            }
    
    def authenticate_user(self, email: str, password: str) -> Dict[str, Any]:
        """Authenticate user login"""
        try:
            auth_response = self.supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if auth_response.user:
                user_id = auth_response.user.id
                
                # Get user profile
                profile_response = self.supabase.table('users').select('*').eq('id', user_id).execute()
                
                if profile_response.data:
                    user_profile = profile_response.data[0]
                    token = self.generate_jwt_token(user_id)
                    
                    return {
                        'success': True,
                        'user_id': user_id,
                        'user_profile': user_profile,
                        'token': token,
                        'message': 'Login successful'
                    }
                else:
                    return {
                        'success': False,
                        'message': 'User profile not found'
                    }
            else:
                return {
                    'success': False,
                    'message': 'Invalid email or password'
                }
                
        except Exception as e:
            return {
                'success': False,
                'message': f'Authentication error: {str(e)}'
            }
    
    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user profile by ID"""
        try:
            response = self.supabase.table('users').select('*').eq('id', user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error getting user profile: {str(e)}")
            return None
    
    def update_user_profile(self, user_id: str, updates: Dict[str, Any]) -> bool:
        """Update user profile"""
        try:
            updates['updated_at'] = datetime.utcnow().isoformat()
            response = self.supabase.table('users').update(updates).eq('id', user_id).execute()
            return len(response.data) > 0
        except Exception as e:
            print(f"Error updating user profile: {str(e)}")
            return False
    
    # Conversation Management
    def create_conversation(self, user_id: str, title: str = "New Conversation") -> Optional[str]:
        """Create a new conversation"""
        try:
            conversation_data = {
                'user_id': user_id,
                'title': title
            }
            response = self.supabase.table('conversations').insert(conversation_data).execute()
            return response.data[0]['id'] if response.data else None
        except Exception as e:
            print(f"Error creating conversation: {str(e)}")
            return None
    
    def get_user_conversations(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all conversations for a user"""
        try:
            response = self.supabase.table('conversations').select('*').eq('user_id', user_id).order('updated_at', desc=True).execute()
            return response.data or []
        except Exception as e:
            print(f"Error getting conversations: {str(e)}")
            return []
    
    def update_conversation_title(self, conversation_id: str, title: str) -> bool:
        """Update conversation title"""
        try:
            updates = {
                'title': title,
                'updated_at': datetime.utcnow().isoformat()
            }
            response = self.supabase.table('conversations').update(updates).eq('id', conversation_id).execute()
            return len(response.data) > 0
        except Exception as e:
            print(f"Error updating conversation title: {str(e)}")
            return False
    
    def delete_conversation(self, conversation_id: str, user_id: str) -> bool:
        """Delete a conversation and its messages"""
        try:
            # First delete all messages in the conversation
            self.supabase.table('messages').delete().eq('conversation_id', conversation_id).execute()
            
            # Then delete the conversation
            response = self.supabase.table('conversations').delete().eq('id', conversation_id).eq('user_id', user_id).execute()
            return len(response.data) > 0
        except Exception as e:
            print(f"Error deleting conversation: {str(e)}")
            return False
    
    # Message Management
    def save_message(self, conversation_id: str, user_id: str, question: str, response: str = None) -> Optional[str]:
        """Save a message to the database"""
        try:
            message_data = {
                'conversation_id': conversation_id,
                'user_id': user_id,
                'question': question,
                'response': response
            }
            message_response = self.supabase.table('messages').insert(message_data).execute()
            
            # Update conversation timestamp
            self.supabase.table('conversations').update({
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', conversation_id).execute()
            
            return message_response.data[0]['id'] if message_response.data else None
        except Exception as e:
            print(f"Error saving message: {str(e)}")
            return None
    
    def update_message_response(self, message_id: str, response: str) -> bool:
        """Update message response"""
        try:
            response_data = self.supabase.table('messages').update({
                'response': response
            }).eq('id', message_id).execute()
            return len(response_data.data) > 0
        except Exception as e:
            print(f"Error updating message response: {str(e)}")
            return False
    
    def get_conversation_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get all messages for a conversation"""
        try:
            response = self.supabase.table('messages').select('*').eq('conversation_id', conversation_id).order('created_at', desc=False).execute()
            return response.data or []
        except Exception as e:
            print(f"Error getting conversation messages: {str(e)}")
            return []
    def get_conversation_by_id(self, conversation_id: str) -> Optional[Dict]:
        """Get a specific conversation by ID"""
        try:
            response = self.supabase.table('conversations').select('*').eq('id', conversation_id).single().execute()
            return response.data
        except Exception as e:
            print(f"Error getting conversation by ID: {str(e)}")
            return None
    
    def get_recent_messages(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent messages for a user across all conversations"""
        try:
            response = self.supabase.table('messages').select('*, conversations(title)').eq('user_id', user_id).order('created_at', desc=True).limit(limit).execute()
            return response.data or []
        except Exception as e:
            print(f"Error getting recent messages: {str(e)}")
            return []

    def update_conversation_shared(self, conversation_id: str, shared: bool) -> bool:
        """Update conversation shared status"""
        try:
            response = self.supabase.table('conversations').update({
                'shared': shared,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', conversation_id).execute()
            return len(response.data) > 0
        except Exception as e:
            print(f"Error updating conversation shared status: {str(e)}")
            return False