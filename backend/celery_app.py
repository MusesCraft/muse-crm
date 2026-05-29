"""
Celery worker entry point.

The Flask app factory configures the shared Celery instance with broker,
backend, and Flask application context. Importing app.tasks registers task
definitions before the worker starts consuming jobs.
"""

import os

from app import celery, create_app

flask_app = create_app(os.environ.get('FLASK_ENV', 'production'))

# Ensure decorated tasks are registered with the configured Celery instance.
from app import tasks  # noqa: F401,E402
