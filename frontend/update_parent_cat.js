const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.category.update({
    where: { slug: 'gotovye-nabory-dlya-robototehniki' },
    data: {
      description: 'Готовые наборы Arduino, Raspberry Pi, LEGO, Micro:bit и STEM-комплекты для начинающих и опытных. Купить набор Arduino для начинающих, стартовый набор для школы или кружка робототехники с доставкой по Казахстану.',
    }
  });
  console.log('Updated:', r.slug);
  console.log('Desc:', r.description);
  await prisma.$disconnect();
}
main().catch(function(e) { console.error(e.message); process.exit(1); });
