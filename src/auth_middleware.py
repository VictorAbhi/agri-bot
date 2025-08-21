from functools import wraps
from flask import request, jsonify, g
from src.supabase_client import SupabaseManager

def init_auth_middleware(app):
    """Initialize authentication middleware"""
    supabase_manager = SupabaseManager()
    
    def require_auth(f):
        """Decorator to require authentication for routes"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = None
            
            # Get token from Authorization header
            if 'Authorization' in request.headers:
                auth_header = request.headers['Authorization']
                try:
                    token = auth_header.split(' ')[1]  # Bearer <token>
                except IndexError:
                    return jsonify({'error': 'Invalid authorization header format'}), 401
            
            if not token:
                return jsonify({'error': 'Authentication token is missing'}), 401
            
            # Verify token
            user_id = supabase_manager.verify_jwt_token(token)
            if not user_id:
                return jsonify({'error': 'Invalid or expired token'}), 401
            
            # Get user profile
            user_profile = supabase_manager.get_user_profile(user_id)
            if not user_profile:
                return jsonify({'error': 'User not found'}), 401
            
            # Store user info in Flask's g object
            g.current_user_id = user_id
            g.current_user = user_profile
            g.supabase_manager = supabase_manager
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return require_auth
