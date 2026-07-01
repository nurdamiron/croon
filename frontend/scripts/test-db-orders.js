const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orderCount = await prisma.kaspiOrder.count();
  console.log(`Total Kaspi Orders: ${orderCount}`);

  const orders = await prisma.kaspiOrder.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      items: true
    }
  });

  console.log('\nSample Orders:');
  orders.forEach(o => {
    console.log(`Order ID: ${o.kaspiOrderId} | State: ${o.state} | Total Price: ${o.totalPrice} | Created: ${o.createdAt}`);
    o.items.forEach(item => {
      console.log(`  - SKU: ${item.kaspiSku} | Name: ${item.kaspiName} | Qty: ${item.quantity} | Price: ${item.price}`);
    });
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
