from langchain.document_loaders import PyPDFLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from typing import List
from langchain.schema import Document


# Extract Data From the PDF File

def load_pdf(data):
    loader = DirectoryLoader(data, glob="*.pdf", loader_cls=PyPDFLoader)
    documents = loader.load()
    return documents   



def filter_to_minimal_docs(documents: List[Document], metadata_keys: List[str] = ["source"]) -> List[Document]:
    """
    Filter documents to retain only specified metadata keys, optimizing for low-resource environments.
    
    Args:
        documents: List of LangChain Document objects.
        metadata_keys: List of metadata keys to keep (default: ["source"]).
    
    Returns:
        List of Document objects with minimal metadata and non-empty content.
    """
    minimal_docs: List[Document] = []
    for doc in documents:
        # Skip documents with empty or whitespace-only content
        if not doc.page_content or doc.page_content.isspace():
            continue
        
        # Build minimal metadata dictionary
        metadata = {
            key: doc.metadata.get(key, None) for key in metadata_keys
            if doc.metadata.get(key) is not None
        }
        
        # Only append if metadata contains at least one valid key-value pair
        if metadata:
            minimal_docs.append(
                Document(
                    page_content=doc.page_content.strip(),
                    metadata=metadata
                )
            )
    
    return minimal_docs

# Split the documents into smaller chunks
def text_split(extracted_data):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=20,
    )
    texts_chunk = text_splitter.split_documents(extracted_data)
    return texts_chunk


def download_embeddings(model_name= "sentence-transformers/all-MiniLM-L6-v2"):
    embeddings = HuggingFaceEmbeddings(model_name=model_name)
    return embeddings
