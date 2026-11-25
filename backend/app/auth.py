"""帳號與權限：管理者可以做所有事，其他帳號只能看。"""
import base64
import hashlib
import hmac
import os

from fastapi import HTTPException, Request
from sqlalchemy import select

from . import store


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_password(pw: str, stored: str) -> bool:
    try:
        salt, h = (base64.b64decode(x) for x in stored.split("$"))
    except Exception:
        return False
    return hmac.compare_digest(hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1), h)


def ensure_admin():
    """第一次啟動時，用環境變數建立管理者帳號。"""
    user, pw = os.environ.get("ADMIN_USER"), os.environ.get("ADMIN_PASSWORD")
    with store.session() as s:
        if s.scalars(select(store.User).where(store.User.role == "admin")).first() or not (user and pw):
            return
        s.add(store.User(username=user, pw_hash=hash_password(pw), role="admin"))
        s.commit()


def current(request: Request):
    u = request.session.get("user")
    if not u:
        raise HTTPException(401, "請先登入")
    return u


def admin(request: Request):
    u = current(request)
    if u.get("role") != "admin":
        raise HTTPException(403, "只有管理者可以做這件事")
    return u
