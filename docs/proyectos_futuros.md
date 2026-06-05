# Documentación Interna: Proyectos a Futuro (Estimación Avanzada por CSP)

Este documento archiva los conceptos de estimación avanzada basados en el perfil de superficie del concreto para futuras fases de la herramienta.

## 1. Perfil de Superficie del Concreto (CSP)

El **Concrete Surface Profile (CSP)** es una clasificación estandarizada por el *International Concrete Repair Institute (ICRI)* que define la rugosidad de la superficie del concreto en una escala del 1 al 9:

| Nivel CSP | Textura Común | Método de Preparación |
| :--- | :--- | :--- |
| **CSP 1** | Ácido (muy liso) | Lavado con ácido |
| **CSP 2** | Lijado ligero | Lijadora de disco |
| **CSP 3** | Desbastado fino | Desbastadora de diamante |
| **CSP 4** | Granallado ligero | Granalladora (Shotblasting) |
| **CSP 5** | Granallado medio | Granalladora |
| **CSP 6** | Escarificado ligero | Escarificadora |
| **CSP 7** | Escarificado medio | Escarificadora |
| **CSP 8** | Hidrodemolición | Chorro de agua a alta presión |
| **CSP 9** | Desbastado profundo | Martillo neumático / Rotomartillo |

---

## 2. Impacto en el Consumo de Material (Mermas)

A mayor nivel de CSP, el concreto presenta valles más profundos. Esto requiere rellenar más volumen con resinas primarias o morteros antes de lograr una superficie lisa.

### Multiplicador de Consumo Adicional Teórico
Cuando la herramienta madure, se podría implementar una matriz de ajuste automático del rendimiento para capas base o autonivelantes:

```
[Área Cotizada] x [Rendimiento Teórico] x [Factor CSP]
```

Donde el **Factor CSP** incrementa la cantidad de material:
*   **CSP 1 - 2:** +5% de merma (superficie lisa).
*   **CSP 3 - 4:** +10% a 15% de merma (estándar para la mayoría de sistemas industriales).
*   **CSP 5 - 6:** +20% a 30% de merma (requiere capas de renivelación gruesas).
*   **CSP 7 - 9:** +40% o más (casos de reparación severa).
