from pydantic import BaseModel, EmailStr
from enum import Enum
from typing import Optional


class UserRole(str, Enum):
    general_user = "general_user"
    analyst = "analyst"
    admin = "admin"


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole = UserRole.general_user


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.general_user


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleUpdateRequest(BaseModel):
    role: UserRole


class RoleUpdateResponse(BaseModel):
    message: str
    user_id: str
    new_role: str
