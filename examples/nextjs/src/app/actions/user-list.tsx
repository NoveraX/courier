"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ActionState, deleteUser } from "./actions";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export function UserList({ users }: { users: User[] }) {
  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No users found.</p>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(deleteUser, {});

  if (state.success) return null;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{user.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {user.role}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <form action={action}>
        <input type="hidden" name="id" value={user.id} />
        <Button type="submit" variant="ghost" size="icon" disabled={isPending} className="h-8 w-8">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
      </form>
    </div>
  );
}
