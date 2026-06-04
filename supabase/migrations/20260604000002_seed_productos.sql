-- Seed: Insertar los 16 productos iniciales de BUCA Recubrimientos
-- Solo inserta si aun no existen (evita duplicados)
insert into public.productos (nombre, "cantRef", unidad, moneda, precio, "tieneRendimiento", nota, rendimiento)
values
  ('BucaTrafic',                  38,   'L',    'USD', 10.40, true,  'Tráfico vehicular',                                    5),
  ('BucaReflex',                  240,  'L',    'USD', 3.10,  true,  'Acabado brillante / reflectivo',                       8),
  ('BucaPoxyMulti',               57,   'L',    'MXN', 196,   true,  'Epóxico multiusos - primario y capa intermedia',       6),
  ('PoxyParte B',                 28.5, 'L',    'MXN', 230,   false, 'Parte B - proporción 2:1 con PoxyMulti',               null),
  ('BucaPoxyPlus Top - Pte A',    1,    'L',    'MXN', 300,   true,  'Parte A - acabado final epóxico',                      6),
  ('BucaPoxyPlus Top - Pte B',    1,    'L',    'MXN', 357,   false, 'Parte B - proporción 2:1 con Pte A',                   null),
  ('Tapaporo Parte A',            19,   'L',    'USD', 247,   true,  'Cubeta 19 L - tapaporo para mortero',                  10),
  ('Tapaporo Parte B',            9.5,  'L',    'USD', 142,   false, 'Cubeta 9.5 L - Parte B',                               null),
  ('Saco MX-35',                  25,   'Saco', 'MXN', 230,   false, 'Arena para mortero MX-35',                             null),
  ('Kit BucaCrete HL',            3,    'Kit',  'MXN', 1900,  true,  'Vida de mezcla 15-20 min',                             4),
  ('Bucathane HC Top',            8,    'L',    'MXN', 443,   true,  '2 manos recomendadas - resistencia UV +4 años',        4),
  ('BucaAqua',                    4,    'L',    'MXN', 165,   true,  'Impermeabilizante',                                    2),
  ('Base Primer - Parte A',       8,    'L',    'MXN', 1360,  true,  'Anticorrosivo epóxico para metal',                     8),
  ('Base Primer - Parte B',       2,    'L',    'MXN', 460,   false, 'Parte B - proporción 4:1 con Pte A',                   null),
  ('Cinta Azul 2"',               1,    'Pieza','MXN', 160,   false, 'Accesorio',                                            null),
  ('Llana Lisa Redonda',          1,    'Pieza','MXN', 450,   false, 'Accesorio',                                            null)
on conflict do nothing;
