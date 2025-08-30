# AgriBot 🌱🤖

**AgriBot** is a Retrieval-Augmented Generation (RAG) system for agricultural knowledge, focusing on crop diseases and treatments in the Indian subcontinent. It delivers real-time, markdown-formatted responses for farmers and agricultural professionals.

## Features
- **Disease Diagnosis:** Identify crop diseases from symptoms  
- **Treatment Recommendations:** Generate the solutions from the knowledge base
- **Real-Time Streaming:** Smooth, incremental AI responses via Server-Sent Events  
- **Markdown Rendering:** Clean, formatted answers for symptoms and treatments  
- **Multilingual Support:** Works with English queries (Nepali support planned)  

## Tech Stack
- **Framework:** Flask  
- **AI Core:** LangChain, Google Gemini 1.5 Flash, Sentence Transformers (`all-MiniLM-L6-v2`)  
- **Vector DB:** Pinecone  
- **Front End:** HTML, JavaScript, jQuery, Marked.js  
- **Environment:** python-dotenv  

## Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/agri-bot.git
cd agri-bot

# Create Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Node.js (v16+) and dependencies
pip install -r requirements.txt
npm install

# Set environment variables
echo "GOOGLE_API_KEY=your_google_api_key" > .env
echo "PINECONE_API_KEY=your_pinecone_api_key" >> .env

# Run the app
python app.py
npm start
```
## Screenshots

