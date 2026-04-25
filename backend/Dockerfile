FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/ /app/

# Windows CRLF в entrypoint ломает `set -e` в /bin/sh.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh 2>/dev/null || true

COPY scripts/join_workstation_domain.sh /app/var/agent_scripts/join_workstation_domain.sh
COPY scripts/provision_samba_dc.sh /app/var/agent_scripts/provision_samba_dc.sh
RUN chmod +x /app/var/agent_scripts/join_workstation_domain.sh \
    && chmod +x /app/var/agent_scripts/provision_samba_dc.sh

# Архив для скачивания с панели (распаковка на хосте ALT + ./install.sh)
COPY agent /tmp/agent-src
RUN chmod +x /tmp/agent-src/install.sh 2>/dev/null || true \
    && mkdir -p /app/var/agent_dist \
    && tar -C /tmp/agent-src \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        -czf /app/var/agent_dist/domain-agent.tgz . \
    && rm -rf /tmp/agent-src

EXPOSE 8000

# Явный /bin/sh — избегает ошибки «no such file» при CRLF в shebang на Windows.
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD []
