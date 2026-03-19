#!/usr/bin/env python3
"""
MUSE CRM — Seed Admin User

建立預設 admin 用戶供首次部署使用。
如果 admin@musecraft.com 已存在則跳過。

用法：
    cd backend
    python -m scripts.seed_admin
"""

import sys
import os

# 確保可以 import app 模組
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.user import User


def seed_admin():
    app = create_app(os.environ.get('FLASK_ENV', 'development'))
    
    with app.app_context():
        email = 'admin@musecraft.com'
        
        existing = User.query.filter_by(email=email).first()
        if existing:
            print(f"⏭️  Admin 用戶已存在: {email} (role={existing.role})")
            return
        
        admin = User(
            name='Admin',
            email=email,
            role='admin',
            is_active=True
        )
        admin.set_password('admin123')
        
        db.session.add(admin)
        db.session.commit()
        
        print(f"✅ Admin 用戶已建立:")
        print(f"   Email:    {email}")
        print(f"   Password: admin123")
        print(f"   Role:     admin")
        print(f"   ID:       {admin.id}")
        print()
        print("⚠️  請在生產環境中立即更改密碼！")


if __name__ == '__main__':
    seed_admin()
