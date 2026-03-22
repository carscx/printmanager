# Scripts históricos / one-shot

No forman parte del **camino de instalación** de una base nueva.

| Archivo | Uso |
|---------|-----|
| `24_migrate_tinta_stock_ml_a_carillas.sql` | Solo bases **legacy** con stock de tinta guardado en **ml** antes del modelo por carillas / script 27. Ejecutar **una vez** con backup; no aplicar en PROD nuevo ni si el stock ya está en carillas. |

Si migrás desde un proyecto viejo y necesitás este paso, copiá el SQL al editor de Supabase desde esta carpeta.
