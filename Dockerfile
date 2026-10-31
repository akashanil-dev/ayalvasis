ARG ODOO_IMAGE=odoo:19.0@sha256:27f920e002c43a1af7022a68f3cc17db71a2f9f3348800cb050721ce54893e49
FROM ${ODOO_IMAGE}
USER root
COPY --chown=odoo:odoo infra/odoo/ /opt/infra/
COPY --chown=odoo:odoo addons/ /mnt/extra-addons/
USER odoo
ENTRYPOINT ["python3", "/opt/infra/entrypoint.py"]
CMD ["serve"]
