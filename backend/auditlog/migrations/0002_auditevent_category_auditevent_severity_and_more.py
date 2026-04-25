from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("auditlog", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditevent",
            name="category",
            field=models.CharField(blank=True, db_index=True, max_length=32),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="severity",
            field=models.CharField(
                choices=[("normal", "Normal"), ("critical", "Critical")],
                db_index=True,
                default="normal",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="source",
            field=models.CharField(
                choices=[("panel", "Panel"), ("agent", "Agent")],
                db_index=True,
                default="panel",
                max_length=16,
            ),
        ),
    ]
