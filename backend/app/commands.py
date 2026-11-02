import click
from flask.cli import with_appcontext

from .extensions import db
from .models import User


def register_commands(app):
    @app.cli.command("seed-demo")
    @with_appcontext
    def seed_demo():
        """Create demo administrator and laboratory accounts from .env values."""
        import os

        accounts = [
            (os.getenv("DEMO_ADMIN_EMAIL", "admin@securelab.local"), os.getenv("DEMO_ADMIN_PASSWORD", "AdminDemo!2026"), "SecureLab Administrator", "admin"),
            (os.getenv("DEMO_LAB_EMAIL", "lab@securelab.local"), os.getenv("DEMO_LAB_PASSWORD", "LabDemo!2026"), "Laboratory Staff", "lab"),
        ]
        for email, password, name, role in accounts:
            user = User.query.filter_by(email=email.lower()).first()
            if user:
                click.echo(f"Already exists: {email}")
                continue
            user = User(name=name, email=email.lower(), role=role)
            user.set_password(password)
            db.session.add(user)
            click.echo(f"Created {role}: {email}")
        db.session.commit()
        click.echo("Demo accounts ready. Change demo passwords before any shared deployment.")
