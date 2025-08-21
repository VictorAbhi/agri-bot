# Agri-bot 🌱🤖

A Retrieval-Augmented Generation (RAG) system for agricultural knowledge, focusing on crop diseases and treatments in the Indian subcontinent.

## Features

- **Disease Diagnosis**: Identify crop diseases from symptoms
- **Treatment Recommendations**: Get both chemical and organic solutions
- **Region-Specific Advice**: Tailored recommendations for Indian subcontinents.
- **Multilingual Support**: Works with English queries ( will be trying to work with Nepali as well)

## Tech Stack

- **Framework**: Flask 3.1.1
- **AI Core**: 
  - LangChain 0.3.26
  - Gemini Flash
  - Sentence Transformers 4.1.0
- **Vector DB**: Pinecone
- **PDF Processing**: PyPDF 5.6.1

## Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/yourusername/agri-rag-system.git
   cd agriculture-chatbot

2. Make Python virtual environment
3. Install package manager
    \`\`\`
    pip install uv
    \`\`\`
4. Install requirements
    \`\`\`
    uv add -r requirements.txt
    \`\`\`
