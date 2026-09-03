import { prisma } from "../../lib/db.js";

/** User persistence beyond Better Auth's own account lifecycle. */
export const userRepository = {
  /** Current avatar URL (or null). */
  findImage(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
  },

  /** Update the avatar URL (or clear it with null). */
  updateImage(userId: string, imageUrl: string | null) {
    return prisma.user.update({
      where: { id: userId },
      data: { image: imageUrl },
      select: { id: true, image: true },
    });
  },
};
