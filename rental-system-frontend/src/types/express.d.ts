import "passport";

declare global {
  namespace Express {
    interface User {
      driverId?: string;
      authUserId?: string;
      role?: string;
      email?: string;
    }
  }
}

export {};
