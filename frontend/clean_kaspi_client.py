import re

with open('src/app/admin/kaspi/KaspiClient.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def delete_lines(start_idx, end_idx):
    for i in range(start_idx, end_idx + 1):
        lines[i] = ''

# 1. Row type (27-43)
delete_lines(27, 43)

# 2. State variables (55-59)
delete_lines(55, 59)

# 3. URL params parsing in selectAllByFilter (124-128)
delete_lines(124, 128)

# 4. Functions (171-271)
delete_lines(171, 271)

# 5. Formula button (335-342)
delete_lines(335, 342)

# 6. Bulk dumping buttons (426-549)
delete_lines(426, 549)

# 7. Formula form (561-600)
delete_lines(561, 600)

# 8. Table headers (637-642)
delete_lines(637, 642)

# 9. Table cells (991-1151)
delete_lines(991, 1151)

# 10. DumpPriceInput (1156-1189)
delete_lines(1156, 1189)

with open('src/app/admin/kaspi/KaspiClient.tsx', 'w', encoding='utf-8') as f:
    for line in lines:
        if line != '':
            f.write(line)
