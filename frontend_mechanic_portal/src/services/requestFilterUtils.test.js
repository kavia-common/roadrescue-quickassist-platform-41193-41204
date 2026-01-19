import { filterRequests } from "./requestFilterUtils";

describe("filterRequests", () => {
  const rows = [
    { id: "1", status: "open", issueDescription: "Battery dead", locationText: "Downtown" },
    { id: "2", status: "assigned", issueDescription: "Flat tire", locationText: "Northside" },
    { id: "3", status: "completed", issueDescription: "Engine overheating", locationText: "Downtown East" },
  ];

  test("text filters are case-insensitive contains", () => {
    const out = filterRequests(rows, { location: "DOWN", issue: "batt", status: "" });
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  test("filters are combinable (AND)", () => {
    const out = filterRequests(rows, { location: "downtown", issue: "engine", status: "" });
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  test("status filter matches canonical statuses", () => {
    const out = filterRequests(rows, { location: "", issue: "", status: "assigned" });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  test("empty filters return all rows", () => {
    const out = filterRequests(rows, { location: "", issue: "", status: "" });
    expect(out).toHaveLength(3);
  });

  test("location filter matches common DB field names (e.g., pickup_location)", () => {
    const dbRows = [
      { id: "a", status: "open", issueDescription: "Tow needed", pickup_location: "Downtown" },
      { id: "b", status: "open", issueDescription: "Tow needed", location: "Northside" },
      { id: "c", status: "open", issueDescription: "Tow needed", location_text: "Downtown East" },
    ];

    expect(filterRequests(dbRows, { location: "downtown", issue: "", status: "" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterRequests(dbRows, { location: "north", issue: "", status: "" }).map((r) => r.id)).toEqual(["b"]);
  });

  test("location filter normalizes whitespace and diacritics", () => {
    const dbRows = [
      { id: "a", status: "open", issueDescription: "Tow needed", pickup_location: "  São   José  " },
      { id: "b", status: "open", issueDescription: "Tow needed", pickup_location: "St. John's, Downtown" },
    ];

    expect(filterRequests(dbRows, { location: "sao jose", issue: "", status: "" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRequests(dbRows, { location: "st johns downtown", issue: "", status: "" }).map((r) => r.id)).toEqual(["b"]);
  });
});
