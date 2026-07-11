interface OwnedResource {
  userId: string | null;
  anonymousSessionId: string | null;
}

interface ActorIdentity {
  userId: string | null;
  anonymousSessionId: string | null;
}

export function isOwnedByActor(
  resource: OwnedResource,
  actor: ActorIdentity
): boolean {
  if (resource.userId) {
    return actor.userId === resource.userId;
  }

  if (resource.anonymousSessionId) {
    return actor.anonymousSessionId === resource.anonymousSessionId;
  }

  return false;
}
