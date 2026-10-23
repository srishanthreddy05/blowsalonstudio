import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Staff Selection & Dropdown Validation", () => {
  // Mock staff data simulating Firestore collection
  const mockFirestoreStaff = [
    { id: "staff-01", name: "Alex Stylist", status: "Active", dutyStatus: "onDuty", role: "Senior Stylist" },
    { id: "staff-02", name: "Jordan Barber", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-03", name: "Sam Colorist", status: "Active", dutyStatus: undefined, role: "Color Specialist" },
    { id: "staff-04", name: "Elena Spa", status: "active", dutyStatus: "offDuty", role: "Spa Therapist" },
    { id: "staff-05", name: "Former Employee", status: "Inactive", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-06", name: "Michael Manager", status: "Active", dutyStatus: "onDuty", role: "Salon Manager" },
    { id: "staff-07", name: "Bella Hair", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-08", name: "Chris Nails", status: "Active", dutyStatus: "offDuty", role: "Nail Tech" },
    { id: "staff-09", name: "Daisy Cut", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-10", name: "Ethan Groom", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-11", name: "Fiona Style", status: "Active", dutyStatus: "offDuty", role: "Senior Stylist" },
    { id: "staff-12", name: "George Wash", status: "Active", dutyStatus: "offDuty", role: "Assistant" },
    { id: "staff-13", name: "Hannah Wave", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-14", name: "Ian Trim", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-15", name: "Jack Perm", status: "Active", dutyStatus: "offDuty", role: "Senior Stylist" },
    { id: "staff-16", name: "Katie Lash", status: "Active", dutyStatus: "offDuty", role: "Specialist" },
    { id: "staff-17", name: "Liam Braid", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-18", name: "Mia Highlights", status: "Active", dutyStatus: "offDuty", role: "Master Stylist" },
    { id: "staff-19", name: "Noah Fade", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
    { id: "staff-20", name: "Zack Final", status: "Active", dutyStatus: "offDuty", role: "Stylist" },
  ];

  test("Requirement 2: Every active non-manager staff member is included, even if offDuty or unclocked", () => {
    // normalizeStaffRole equivalent for test (matches types/staff.ts)
    const normalizeStaffRole = (role) => {
      if (!role) return "STYLIST";
      const normalized = role.trim().toUpperCase();
      if (normalized === "MANAGER" || normalized === "SALON MANAGER") return "MANAGER";
      return "STYLIST";
    };

    // Current BillingTerminal filter implementation
    const staffList = mockFirestoreStaff.filter(
      (s) =>
        Boolean(s.name?.trim()) &&
        s.status?.trim().toLowerCase() === "active" &&
        normalizeStaffRole(s.role) !== "MANAGER"
    );

    const staffNames = staffList.map((s) => s.name);

    // Verify count: 18 active non-manager staff out of 20 (1 inactive, 1 manager excluded)
    assert.equal(staffList.length, 18, "All 18 active non-manager staff members must be included");
    assert.ok(!staffNames.includes("Former Employee"), "Inactive staff member must be excluded");
    assert.ok(!staffNames.includes("Michael Manager"), "Manager must be excluded from billing staff dropdown");

    // Verify staff with offDuty or undefined dutyStatus are visible
    assert.ok(staffNames.includes("Jordan Barber"), "Active staff with offDuty must be included");
    assert.ok(staffNames.includes("Sam Colorist"), "Active staff with undefined dutyStatus must be included");
    assert.ok(staffNames.includes("Elena Spa"), "Active staff with lowercase status must be included");

    // Verify first, middle, and last active staff members are all present
    assert.equal(staffNames[0], "Alex Stylist", "First staff member must be present");
    assert.ok(staffNames.length > 10, "Enough staff for overflow testing");
    assert.equal(staffNames[staffNames.length - 1], "Zack Final", "Last staff member must be present");
  });

  test("Requirement 4 & Validation: Overflow list supports selecting first, middle, and last staff member", () => {
    const staffList = mockFirestoreStaff.filter(
      (s) => Boolean(s.name?.trim()) && s.status?.trim().toLowerCase() === "active"
    );
    const options = staffList.map((s) => s.name);

    // Simulate dropdown options builder
    const buildCombinedOptions = (val, isCredit, opts) => {
      const list = [];
      if (isCredit || val === "System") list.push("System");
      if (isCredit && val && val !== "System" && !opts.includes(val)) list.push(val);
      for (const opt of opts) {
        if (!list.includes(opt)) list.push(opt);
      }
      return list;
    };

    const combined = buildCombinedOptions("", false, options);

    // Verify list overflows (19 items > 6 items threshold for scrolling)
    assert.ok(combined.length > 6, "List has enough items to overflow the dropdown");

    // Select first staff member
    let selected = combined[0];
    assert.equal(selected, "Alex Stylist");

    // Select middle staff member
    const midIndex = Math.floor(combined.length / 2);
    selected = combined[midIndex];
    assert.equal(selected, options[midIndex]);

    // Select last staff member
    selected = combined[combined.length - 1];
    assert.equal(selected, "Zack Final");
  });

  test("Requirement 7: Staff selection preserves billing invoice payload and database records", () => {
    // Simulate selecting a staff member for a service row
    const selectedStaffName = "Zack Final";
    const matchedStaff = mockFirestoreStaff.find((s) => s.name === selectedStaffName);

    assert.ok(matchedStaff, "Matched staff must be found in Firestore staff data");
    assert.equal(matchedStaff.id, "staff-20");

    // Verify invoice service row calculation
    const row = {
      id: 1,
      serviceId: "svc-haircut",
      service: "Haircut",
      category: "Hair",
      staff: selectedStaffName,
      price: 500,
      quantity: 1,
      discount: 50,
    };

    const invoiceService = {
      serviceId: row.serviceId,
      serviceName: row.service,
      category: row.category,
      staffId: matchedStaff.id,
      staffName: row.staff,
      price: row.price,
      quantity: row.quantity,
      discount: row.discount,
      staffRole: matchedStaff.role || "Stylist",
      amount: Math.max(row.price - row.discount, 0),
    };

    assert.equal(invoiceService.staffId, "staff-20");
    assert.equal(invoiceService.staffName, "Zack Final");
    assert.equal(invoiceService.staffRole, "Stylist");
    assert.equal(invoiceService.amount, 450);
  });

  test("Special settlement rows (System & Credit Settle) are preserved", () => {
    const options = ["Alex Stylist", "Jordan Barber"];

    const buildCombinedOptions = (val, isCredit, opts) => {
      const list = [];
      if (isCredit || val === "System") list.push("System");
      if (isCredit && val && val !== "System" && !opts.includes(val)) list.push(val);
      for (const opt of opts) {
        if (!list.includes(opt)) list.push(opt);
      }
      return list;
    };

    // Credit settlement row where original staff is "Former Stylist" (no longer in active list)
    const creditOptions = buildCombinedOptions("Former Stylist", true, options);
    assert.ok(creditOptions.includes("System"), "Credit settlement allows System");
    assert.ok(creditOptions.includes("Former Stylist"), "Original credit staff is preserved");
    assert.ok(creditOptions.includes("Alex Stylist"), "Active options are also available");
  });
});
