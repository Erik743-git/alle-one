import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UserWithCompany = User & {
  company: { id: string; name: string } | null;
};

type PublicUser = Omit<UserWithCompany, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublicUser(user: UserWithCompany): PublicUser {
    const { passwordHash: _omit, ...rest } = user;
    return rest;
  }

  async findAll() {
    const rows = await this.prisma.user.findMany({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rows.map((u) => this.toPublicUser(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.toPublicUser(user);
  }

  async create(data: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new BadRequestException('Já existe um usuário com este e-mail');
    }

    let passwordHash: string | null = null;

    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const created = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        status: data.status ?? UserStatus.ACTIVE,
        companyId: data.companyId ?? null,
        firstAccess: data.firstAccess ?? true,
      },
      include: {
        company: true,
      },
    });

    return this.toPublicUser(created);
  }

  async update(id: string, data: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    let passwordHash = existingUser.passwordHash;

    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        status: data.status,
        companyId: data.companyId,
        firstAccess: data.firstAccess,
      },
      include: {
        company: true,
      },
    });

    return this.toPublicUser(updated);
  }

  async remove(id: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const deactivated = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.INACTIVE,
      },
      include: {
        company: true,
      },
    });

    return this.toPublicUser(deactivated);
  }
}
