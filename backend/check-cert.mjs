import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const cert = await p.certificate.findUnique({
  where: { id: '786f5dd0-6f16-4637-9a62-4cb21bc34dd0' },
  include: { user: { select: { email: true, name: true, id: true } }, course: { select: { title: true } } }
});
console.log('Cert:', JSON.stringify(cert, null, 2));
// Also get any cert
const any = await p.certificate.findFirst({ include: { user: { select: { email: true } } } });
console.log('Any cert:', JSON.stringify(any, null, 2));
await p.$disconnect();
