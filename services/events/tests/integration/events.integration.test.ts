import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;
const accountId = "acc_testaccount001";

const TEST_JWT_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2vT
q7LIBnapaXp5KMUuBPO8MR7q8vAGEVGSRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAQIDAQAB
-----END PUBLIC KEY-----`;

function makeAuthHeader(claims: Record<string, unknown>): string {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  return `Bearer fake.${payload}.sig`;
}

async function inject(
  app: FastifyInstance,
  method: string,
  url: string,
  body?: unknown
) {
  return await app.inject({
    method: method as any,
    url,
    headers: {
      authorization: makeAuthHeader({ sub: "usr_1", accountId, email: "t@example.com", role: "admin" }),
      "content-type": "application/json",
    },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();

  app = await buildApp({
    databaseUrl: container.getConnectionUri(),
    jwtPublicKey: TEST_JWT_KEY,
    nodeEnv: "test",
    runMigrations: true,
  });

  app.addHook("preHandler", async (request) => {
    const auth = request.headers.authorization;
    if (auth?.startsWith("Bearer fake.")) {
      const payload = auth.split(".")[1]!;
      request.claims = JSON.parse(
        Buffer.from(payload, "base64url").toString()
      );
    }
  });

  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  await container.stop();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "events" });
  });
});

describe("Events CRUD", () => {
  let eventId: string;

  it("POST /events — creates an event", async () => {
    const res = await inject(app, "POST", "/events", {
      name: "Annual Conference 2026",
      description: "A great conference",
      startsAt: "2026-06-01T09:00:00Z",
      endsAt: "2026-06-01T17:00:00Z",
      capacityMax: 100,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Annual Conference 2026");
    expect(body.data.status).toBe("active");
    eventId = body.data.id;
  });

  it("GET /events — lists events", async () => {
    const res = await inject(app, "GET", "/events");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /events/:id — gets an event", async () => {
    const res = await inject(app, "GET", `/events/${eventId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(eventId);
    expect(body.data.name).toBe("Annual Conference 2026");
  });

  it("PATCH /events/:id — updates an event", async () => {
    const res = await inject(app, "PATCH", `/events/${eventId}`, {
      name: "Annual Conference 2026 (Updated)",
      isOpen: false,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.name).toBe("Annual Conference 2026 (Updated)");
    expect(body.data.isOpen).toBe(false);
  });

  it("GET /events — filters by status", async () => {
    const res = await inject(app, "GET", "/events?status=active");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.every((e: any) => e.status === "active")).toBe(true);
  });

  it("GET /events/:id — returns 404 for unknown event", async () => {
    const res = await inject(app, "GET", "/events/evt_notfound00000");
    expect(res.statusCode).toBe(404);
  });

  it("POST /events — rejects invalid dates (ends before starts)", async () => {
    const res = await inject(app, "POST", "/events", {
      name: "Bad Dates",
      startsAt: "2026-06-01T17:00:00Z",
      endsAt: "2026-06-01T09:00:00Z",
    });
    expect(res.statusCode).toBe(422);
  });

  it("DELETE /events/:id — archives the event", async () => {
    const res = await inject(app, "DELETE", `/events/${eventId}`);
    expect(res.statusCode).toBe(204);
  });
});

describe("Guests CRUD", () => {
  let guestId: string;
  let eventId: string;
  let eventGuestId: string;

  beforeAll(async () => {
    const res = await inject(app, "POST", "/events", { name: "Guest Test Event" });
    eventId = res.json().data.id;
  });

  it("POST /guests — creates a guest", async () => {
    const res = await inject(app, "POST", "/guests", {
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      preferredChannel: "email",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.firstName).toBe("Alice");
    guestId = body.data.id;
  });

  it("GET /guests — lists guests", async () => {
    const res = await inject(app, "GET", "/guests");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /guests/:id — gets a guest", async () => {
    const res = await inject(app, "GET", `/guests/${guestId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.email).toBe("alice@example.com");
  });

  it("PATCH /guests/:id — updates a guest", async () => {
    const res = await inject(app, "PATCH", `/guests/${guestId}`, {
      firstName: "Alicia",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.firstName).toBe("Alicia");
  });

  it("POST /guests — rejects duplicate email", async () => {
    const res = await inject(app, "POST", "/guests", {
      firstName: "Bob",
      lastName: "Jones",
      email: "alice@example.com",
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST /events/:id/guests — adds guest to event", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/guests`, {
      guestId,
      status: "invited",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.status).toBe("invited");
    expect(body.data.guest.id).toBe(guestId);
    eventGuestId = body.data.id;
  });

  it("GET /events/:id/guests — lists event guests", async () => {
    const res = await inject(app, "GET", `/events/${eventId}/guests`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("PATCH /events/:id/guests/:egId/status — updates status", async () => {
    const res = await inject(
      app,
      "PATCH",
      `/events/${eventId}/guests/${eventGuestId}/status`,
      { status: "accepted", attendanceStatus: "attending" }
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("accepted");
    expect(body.data.attendanceStatus).toBe("attending");
    expect(body.data.hasResponded).toBe(true);
  });

  it("POST /events/:id/guests/:egId/check-in — checks in guest", async () => {
    const res = await inject(
      app,
      "POST",
      `/events/${eventId}/guests/${eventGuestId}/check-in`,
      { seatNumber: "A1", tableNumber: "3" }
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.checkedInAt).not.toBeNull();
    expect(body.data.seatNumber).toBe("A1");
    expect(body.data.status).toBe("registered");
  });

  it("POST /events/:id/guests — rejects duplicate guest in event", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/guests`, {
      guestId,
    });
    expect(res.statusCode).toBe(409);
  });

  it("DELETE /events/:id/guests/:egId — removes guest from event", async () => {
    const res = await inject(
      app,
      "DELETE",
      `/events/${eventId}/guests/${eventGuestId}`
    );
    expect(res.statusCode).toBe(204);
  });
});

describe("Bulk add guests", () => {
  let eventId: string;
  const guestIds: string[] = [];

  beforeAll(async () => {
    const ev = await inject(app, "POST", "/events", { name: "Bulk Test Event" });
    eventId = ev.json().data.id;

    for (let i = 0; i < 5; i++) {
      const g = await inject(app, "POST", "/guests", {
        firstName: `Bulk${i}`,
        lastName: "Test",
        email: `bulk${i}@example.com`,
      });
      guestIds.push(g.json().data.id);
    }
  });

  it("POST /events/:id/guests/bulk — adds multiple guests", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/guests/bulk`, {
      guestIds,
      status: "invited",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.added).toBe(5);
    expect(body.data.skipped).toBe(0);
  });

  it("bulk add — skips already-added guests", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/guests/bulk`, {
      guestIds,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.added).toBe(0);
    expect(body.data.skipped).toBe(5);
  });
});

describe("Forms CRUD", () => {
  let eventId: string;
  let formId: string;

  beforeAll(async () => {
    const ev = await inject(app, "POST", "/events", { name: "Form Test Event" });
    eventId = ev.json().data.id;
  });

  it("POST /events/:id/forms — creates a form", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/forms`, {
      name: "Registration Form",
      description: "Please fill in your details",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.name).toBe("Registration Form");
    expect(body.data.fields).toEqual([]);
    formId = body.data.id;
  });

  it("PUT /events/:id/forms/:id/fields — sets form fields", async () => {
    const res = await inject(
      app,
      "PUT",
      `/events/${eventId}/forms/${formId}/fields`,
      {
        fields: [
          { name: "First Name", kind: "text", isRequired: true, position: 0 },
          { name: "Email", kind: "email", isRequired: true, position: 1 },
          {
            name: "Diet",
            kind: "select",
            isRequired: false,
            position: 2,
            details: { options: ["standard", "vegetarian", "vegan"] },
          },
        ],
      }
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.fields).toHaveLength(3);
    expect(body.data.fields[0].name).toBe("First Name");
  });

  it("GET /events/:id/forms — lists forms", async () => {
    const res = await inject(app, "GET", `/events/${eventId}/forms`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /events/:id/forms/:id — gets form with fields", async () => {
    const res = await inject(app, "GET", `/events/${eventId}/forms/${formId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.fields).toHaveLength(3);
  });

  it("PATCH /events/:id/forms/:id — updates form name", async () => {
    const res = await inject(
      app,
      "PATCH",
      `/events/${eventId}/forms/${formId}`,
      { name: "Updated Form" }
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Updated Form");
  });

  it("DELETE /events/:id/forms/:id — deletes form", async () => {
    const toDelete = await inject(app, "POST", `/events/${eventId}/forms`, {
      name: "Temp Form",
    });
    const deleteId = toDelete.json().data.id;
    const res = await inject(
      app,
      "DELETE",
      `/events/${eventId}/forms/${deleteId}`
    );
    expect(res.statusCode).toBe(204);
  });
});

describe("Pages CRUD", () => {
  let eventId: string;
  let pageId: string;

  beforeAll(async () => {
    const ev = await inject(app, "POST", "/events", { name: "Pages Test Event" });
    eventId = ev.json().data.id;
  });

  it("POST /events/:id/pages — creates a page", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/pages`, {
      name: "Registration Page",
      kind: "registration",
      slug: `reg-${eventId}`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.name).toBe("Registration Page");
    expect(body.data.status).toBe("draft");
    expect(body.data.isActive).toBe(false);
    pageId = body.data.id;
  });

  it("GET /events/:id/pages — lists pages", async () => {
    const res = await inject(app, "GET", `/events/${eventId}/pages`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /events/:id/pages/:id — gets a page", async () => {
    const res = await inject(app, "GET", `/events/${eventId}/pages/${pageId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(pageId);
  });

  it("PATCH /events/:id/pages/:id — updates a page", async () => {
    const res = await inject(
      app,
      "PATCH",
      `/events/${eventId}/pages/${pageId}`,
      { name: "Updated Registration Page" }
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Updated Registration Page");
  });

  it("POST /events/:id/pages/:id/publish — publishes page", async () => {
    const res = await inject(
      app,
      "POST",
      `/events/${eventId}/pages/${pageId}/publish`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("active");
    expect(body.data.isActive).toBe(true);
  });

  it("GET /public/pages/:slug — returns public page", async () => {
    const slug = `reg-${eventId}`;
    const res = await app.inject({ method: "GET", url: `/public/pages/${slug}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.slug).toBe(slug);
  });

  it("POST /events/:id/pages — rejects duplicate slug", async () => {
    const res = await inject(app, "POST", `/events/${eventId}/pages`, {
      name: "Duplicate Slug",
      slug: `reg-${eventId}`,
    });
    expect(res.statusCode).toBe(409);
  });

  it("DELETE /events/:id/pages/:id — deletes a page", async () => {
    const p = await inject(app, "POST", `/events/${eventId}/pages`, {
      name: "Temp Page",
      slug: `temp-${Date.now()}`,
    });
    const res = await inject(
      app,
      "DELETE",
      `/events/${eventId}/pages/${p.json().data.id}`
    );
    expect(res.statusCode).toBe(204);
  });
});
