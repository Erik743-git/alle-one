import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { onlineSinceDate } from './presence.util';

const TOUCH_INTERVAL_MS = 2 * 60 * 1000;

@Injectable()
export class PresenceService {
  private readonly lastTouchByUser = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  touch(userId: string): void {
    const now = Date.now();
    const lastTouch = this.lastTouchByUser.get(userId) ?? 0;

    if (now - lastTouch < TOUCH_INTERVAL_MS) {
      return;
    }

    this.lastTouchByUser.set(userId, now);

    void this.prisma.user
      .update({
        where: { id: userId },
        data: { lastSeenAt: new Date(now) },
      })
      .catch(() => {
        this.lastTouchByUser.delete(userId);
      });
  }

  async countOnlineUsers(): Promise<number> {
    return this.prisma.user.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        lastSeenAt: { gte: onlineSinceDate() },
      },
    });
  }
}
