import os

JWT_SECRET = os.environ.get("JWT_SECRET", "techmed-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours