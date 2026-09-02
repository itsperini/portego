"""Lock application tables behind the Portego API.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-02
"""

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


TABLES = (
    "alembic_version",
    "users",
    "user_sessions",
    "homes",
    "gateways",
    "gateway_claims",
)


def upgrade() -> None:
    # RLS is a second boundary if object grants are accidentally restored later.
    # Portego's production connection uses a dedicated privileged backend role,
    # while browser and gateway clients only communicate with FastAPI.
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')

    # Keep this migration compatible with vanilla PostgreSQL in local Docker,
    # where Supabase's API roles do not exist.
    op.execute(
        """
        DO $portego$
        DECLARE
            api_role text;
        BEGIN
            FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
                    EXECUTE format(
                        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
                        api_role
                    );
                    EXECUTE format(
                        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
                        api_role
                    );
                    EXECUTE format(
                        'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
                        api_role
                    );
                    EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', api_role);

                    -- Defaults are scoped to the role running Alembic. In
                    -- production that is Portego's privileged postgres role.
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'REVOKE ALL PRIVILEGES ON TABLES FROM %I',
                        api_role
                    );
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
                        api_role
                    );
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'REVOKE EXECUTE ON FUNCTIONS FROM %I',
                        api_role
                    );
                END IF;
            END LOOP;
        END
        $portego$;
        """
    )

    # Supabase grants schema usage to PUBLIC by default. Removing only the
    # explicit anon/authenticated grants would therefore leave inherited access.
    op.execute("REVOKE USAGE ON SCHEMA public FROM PUBLIC")
    op.execute("GRANT USAGE ON SCHEMA public TO CURRENT_USER")


def downgrade() -> None:
    # This restores Supabase's default Data API grants. It should only be used
    # deliberately when rolling back the private-backend security boundary.
    op.execute("GRANT USAGE ON SCHEMA public TO PUBLIC")
    op.execute(
        """
        DO $portego$
        DECLARE
            api_role text;
        BEGIN
            FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
                    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', api_role);
                    EXECUTE format(
                        'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I',
                        api_role
                    );
                    EXECUTE format(
                        'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I',
                        api_role
                    );
                    EXECUTE format(
                        'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',
                        api_role
                    );
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'GRANT ALL PRIVILEGES ON TABLES TO %I',
                        api_role
                    );
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'GRANT ALL PRIVILEGES ON SEQUENCES TO %I',
                        api_role
                    );
                    EXECUTE format(
                        'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                        'GRANT EXECUTE ON FUNCTIONS TO %I',
                        api_role
                    );
                END IF;
            END LOOP;
        END
        $portego$;
        """
    )

    for table in reversed(TABLES):
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')
