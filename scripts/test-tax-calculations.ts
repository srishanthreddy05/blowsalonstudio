import { calculateBillTotals } from "../lib/utils/billing";
import type { ServiceRow, ProductRow } from "../components/salon-dashboard/types";

function assertEqual(actual: number, expected: number, message: string) {
  const tolerance = 0.001;
  if (Math.abs(actual - expected) > tolerance) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`   Expected: ${expected}, Actual: ${actual}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message} (Result: ${actual})`);
  }
}

console.log("=== RUNNING TAX CALCULATION TEST SUITE ===");

// 1. User Example from Prompt:
// Service Total ₹7,297, Discount ₹500, Taxable ₹6,797, Tax = ₹339.85, Grand Total = ₹7,136.85
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Styling", staff: "Stylist 1", price: 7297, quantity: 1, discount: 0 },
  ];
  const products: ProductRow[] = [];
  const result = calculateBillTotals({
    services,
    products,
    billDiscount: 500,
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 7297, "User Example: Service Total");
  assertEqual(result.serviceDiscount ?? 0, 500, "User Example: Service Discount");
  assertEqual(result.taxableServiceAmount ?? 0, 6797, "User Example: Taxable Service Amount");
  assertEqual(result.taxAmount ?? 0, 339.85, "User Example: Tax Amount (5%)");
  assertEqual(result.productTotal, 0, "User Example: Product Total");
  assertEqual(result.grandTotal, 7136.85, "User Example: Grand Total");
}

// 2. Services Only (Zero discount, Zero retail)
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Cut", staff: "Stylist 1", price: 1000, quantity: 1, discount: 0 },
    { id: 2, service: "Facial", staff: "Stylist 2", price: 2000, quantity: 1, discount: 0 },
  ];
  const result = calculateBillTotals({
    services,
    products: [],
    billDiscount: 0,
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 3000, "Services only: Service Total");
  assertEqual(result.taxableServiceAmount ?? 0, 3000, "Services only: Taxable Service Amount");
  assertEqual(result.taxAmount ?? 0, 150, "Services only: 5% Tax (3000 * 0.05 = 150)");
  assertEqual(result.grandTotal, 3150, "Services only: Grand Total (3000 + 150)");
}

// 3. Services + Discount (Line discount + Bill discount)
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Cut", staff: "Stylist 1", price: 1000, quantity: 1, discount: 100 },
    { id: 2, service: "Hair Spa", staff: "Stylist 1", price: 2000, quantity: 1, discount: 0 },
  ];
  const result = calculateBillTotals({
    services,
    products: [],
    billDiscount: 400, // Total discount = 100 + 400 = 500
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 3000, "Services + discount: Service Total");
  assertEqual(result.serviceDiscount ?? 0, 500, "Services + discount: Total Service Discount");
  assertEqual(result.taxableServiceAmount ?? 0, 2500, "Services + discount: Taxable Amount (3000 - 500 = 2500)");
  assertEqual(result.taxAmount ?? 0, 125, "Services + discount: 5% Tax (2500 * 0.05 = 125)");
  assertEqual(result.grandTotal, 2625, "Services + discount: Grand Total (2500 + 125)");
}

// 4. Services + Retail Products (Retail products must be tax-free)
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Cut", staff: "Stylist 1", price: 2000, quantity: 1, discount: 0 },
  ];
  const products: ProductRow[] = [
    { id: 1, product: "Shampoo Bottle", price: 1000, quantity: 1, discount: 0 },
    { id: 2, product: "Hair Serum", price: 500, quantity: 2, discount: 0 }, // 1000
  ];
  const result = calculateBillTotals({
    services,
    products,
    billDiscount: 0,
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 2000, "Services + retail: Service Total");
  assertEqual(result.productTotal, 2000, "Services + retail: Product Total (Tax-free)");
  assertEqual(result.taxableServiceAmount ?? 0, 2000, "Services + retail: Taxable Service Amount");
  assertEqual(result.taxAmount ?? 0, 100, "Services + retail: 5% Tax ONLY on services (2000 * 0.05 = 100)");
  assertEqual(result.grandTotal, 4100, "Services + retail: Grand Total (2000 + 100 + 2000 = 4100)");
}

// 5. Services + Discount + Retail Products
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Treatment", staff: "Stylist 1", price: 5000, quantity: 1, discount: 0 },
  ];
  const products: ProductRow[] = [
    { id: 1, product: "Hair Mask", price: 1200, quantity: 1, discount: 0 },
  ];
  const result = calculateBillTotals({
    services,
    products,
    billDiscount: 1000, // Discount applies only to services
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 5000, "Services + discount + retail: Service Total");
  assertEqual(result.taxableServiceAmount ?? 0, 4000, "Services + discount + retail: Taxable Services (5000 - 1000 = 4000)");
  assertEqual(result.taxAmount ?? 0, 200, "Services + discount + retail: 5% Tax (4000 * 0.05 = 200)");
  assertEqual(result.productTotal, 1200, "Services + discount + retail: Retail Products (1200, no discount, 0% tax)");
  assertEqual(result.grandTotal, 5400, "Services + discount + retail: Grand Total (4000 + 200 + 1200 = 5400)");
}

// 6. Retail Products Only (0% Tax)
{
  const products: ProductRow[] = [
    { id: 1, product: "Hair Conditioner", price: 800, quantity: 2, discount: 0 },
  ];
  const result = calculateBillTotals({
    services: [],
    products,
    billDiscount: 0,
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 0, "Retail only: Service Total");
  assertEqual(result.productTotal, 1600, "Retail only: Product Total");
  assertEqual(result.taxableServiceAmount ?? 0, 0, "Retail only: Taxable Service Amount");
  assertEqual(result.taxAmount ?? 0, 0, "Retail only: Tax Amount (0% tax on retail)");
  assertEqual(result.grandTotal, 1600, "Retail only: Grand Total");
}

// 7. Membership + Services (Membership not taxed by service tax)
{
  const services: ServiceRow[] = [
    { id: 1, service: "Hair Cut", staff: "Stylist 1", price: 1500, quantity: 1, discount: 0 },
    { id: 2, serviceId: "membership_fee", service: "Membership Fee", staff: "System", price: 1000, quantity: 1, discount: 0, isSystemService: true },
  ];
  const result = calculateBillTotals({
    services,
    products: [],
    billDiscount: 0,
    taxRate: 5,
  });

  assertEqual(result.serviceTotal, 1500, "Membership + service: Standard Service Total");
  assertEqual(result.membershipTotal ?? 0, 1000, "Membership + service: Membership Total");
  assertEqual(result.taxableServiceAmount ?? 0, 1500, "Membership + service: Taxable Services");
  assertEqual(result.taxAmount ?? 0, 75, "Membership + service: 5% Tax only on service (1500 * 0.05 = 75)");
  assertEqual(result.grandTotal, 2575, "Membership + service: Grand Total (1500 + 75 + 1000 = 2575)");
}

// 8. 100% Discount on services
{
  const services: ServiceRow[] = [
    { id: 1, service: "Free Wash", staff: "Stylist 1", price: 500, quantity: 1, discount: 500 },
  ];
  const result = calculateBillTotals({
    services,
    products: [],
    billDiscount: 0,
    taxRate: 5,
  });

  assertEqual(result.taxableServiceAmount ?? 0, 0, "100% discount: Taxable Service Amount");
  assertEqual(result.taxAmount ?? 0, 0, "100% discount: Tax Amount");
  assertEqual(result.grandTotal, 0, "100% discount: Grand Total");
}

console.log("\n🎉 ALL 8 TEST SCENARIOS PASSED PERFECTLY!");
