export type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "moderator";
  createdAt: string;
};

export type Post = {
  id: number;
  userId: number;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
};

let nextUserId = 4;
let nextPostId = 5;

export const users = new Map<number, User>([
  [
    1,
    {
      id: 1,
      name: "Alice Johnson",
      email: "alice@example.com",
      role: "admin",
      createdAt: "2025-01-15T10:00:00Z",
    },
  ],
  [
    2,
    {
      id: 2,
      name: "Bob Smith",
      email: "bob@example.com",
      role: "user",
      createdAt: "2025-02-20T14:30:00Z",
    },
  ],
  [
    3,
    {
      id: 3,
      name: "Carol Williams",
      email: "carol@example.com",
      role: "moderator",
      createdAt: "2025-03-10T09:15:00Z",
    },
  ],
]);

export const posts = new Map<number, Post>([
  [
    1,
    {
      id: 1,
      userId: 1,
      title: "Getting Started with Nexus",
      body: "Nexus is a type-safe HTTP client...",
      tags: ["nexus", "tutorial"],
      createdAt: "2025-03-01T12:00:00Z",
    },
  ],
  [
    2,
    {
      id: 2,
      userId: 1,
      title: "Proxy Mode vs Direct Mode",
      body: "Understanding the two modes of operation...",
      tags: ["nexus", "architecture"],
      createdAt: "2025-03-05T08:00:00Z",
    },
  ],
  [
    3,
    {
      id: 3,
      userId: 2,
      title: "Request Groups Explained",
      body: "How to organize your API calls with groups...",
      tags: ["nexus", "patterns"],
      createdAt: "2025-03-08T16:00:00Z",
    },
  ],
  [
    4,
    {
      id: 4,
      userId: 3,
      title: "Error Handling Best Practices",
      body: "Using HTTPError and isHTTPError for robust error handling...",
      tags: ["nexus", "errors"],
      createdAt: "2025-03-10T11:00:00Z",
    },
  ],
]);

export function getNextUserId() {
  return nextUserId++;
}

export function getNextPostId() {
  return nextPostId++;
}
