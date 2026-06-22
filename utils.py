import uuid
from config import ALLOWED_EXTENSIONS

def allowed_file(filename):
    """检查文件扩展名是否被允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_trace_id():
    """生成一个唯一的trace-id"""
    return str(uuid.uuid4())
