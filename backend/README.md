# AGC Cheswerta — Flask Backend

Self-hosted Flask + PostgreSQL API for the Church Management System.
All primary keys are UUIDs.

## Requirements

- Python 3.11+
- PostgreSQL 14+

## Setup (VSCode)

```bash
cd backend

# 1. Virtualenv
python -m venv .venv
source .venv/bin/activate          
pip install -r requirements.txt

# 2. Config
cp .env.example .env

# 3. Create the database
createdb agc_cheswerta              

# 4. Migrations
export FLASK_APP=app.py             
flask db init                       
flask db migrate -m "init"
flask db upgrade

# 5. Seed default users + modules
python seed.py

# 6. Run the API
flask run                           
```

## Default test accounts (from seed.py)

| Username    | Role            | Password           |
|-------------|-----------------|--------------------|
| superadmin  | super_admin     | SuperAdmin@2026    |
| admin       | admin           | Admin@2026         |
| pastor      | pastor          | Pastor@2026        |
| secretary   | secretary       | Secretary@2026     |
| treasurer   | treasurer       | Treasurer@2026     |
| leader      | ministry_leader | Leader@2026        |

## API map

```
POST   /api/auth/login                {username|email, password} -> {token, user, role}
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users                     admin+
POST   /api/users
PUT    /api/users/<uuid>
DELETE /api/users/<uuid>

GET    /api/members                   ?gender=&department=&status=
POST   /api/members                   admin|secretary
PUT    /api/members/<uuid>
DELETE /api/members/<uuid>            admin

GET    /api/givings                   ?type=&date_from=&date_to=
POST   /api/givings                   admin|treasurer
PUT    /api/givings/<uuid>
DELETE /api/givings/<uuid>

GET    /api/attendance                ?date_from=&date_to=&event_name=
POST   /api/attendance                admin|secretary
PUT    /api/attendance/<uuid>
DELETE /api/attendance/<uuid>

GET    /api/departments
POST   /api/departments               admin
PUT    /api/departments/<uuid>
DELETE /api/departments/<uuid>

GET    /api/announcements
POST   /api/announcements             super_admin
PUT    /api/announcements/<uuid>
DELETE /api/announcements/<uuid>

GET    /api/modules
PUT    /api/modules/<key>             super_admin

GET    /api/feature-flags
PUT    /api/feature-flags/<key>       super_admin

GET    /api/settings
PUT    /api/settings/<key>            super_admin

GET    /api/audit-logs                ?table=&limit=
GET    /api/login-attempts            ?identifier=&limit=
DELETE /api/login-attempts            ?identifier=

GET    /api/account-locks
POST   /api/account-locks             {identifier, locked_until?, reason?}
DELETE /api/account-locks/<identifier>

POST   /api/uploads/avatars           multipart file
POST   /api/uploads/branding          multipart file
```

## Auth header

Send the JWT as:

```
Authorization: Bearer <token>
```
