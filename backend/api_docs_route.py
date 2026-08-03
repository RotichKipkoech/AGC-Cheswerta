"""
api_docs_route.py — adds an interactive Swagger UI page at GET /api/docs.

Wire into app.py's create_app() by adding, right before `return app`:

    from api_docs_route import register_docs_route
    register_docs_route(app)

Loads swagger-ui from a CDN (no extra pip/npm install needed) and points
it at /static/swagger.json, which Flask serves automatically since it's
in the default static folder.
"""

DOCS_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AGC Cheswerta API Docs</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css">
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/static/swagger.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        deepLinking: true,
        persistAuthorization: true,
        docExpansion: 'list',
      });
    };
  </script>
</body>
</html>"""


def register_docs_route(app):
    @app.route("/api/docs")
    def api_docs():
        return DOCS_HTML