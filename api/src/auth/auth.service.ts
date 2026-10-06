import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { AppRole, JwtPayload } from './auth.types';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
};

type ProfileRow = {
  role: AppRole;
  full_name: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.db.one<UserRow>(
      `SELECT id, email, password_hash, full_name FROM public.users WHERE lower(email) = lower($1)`,
      [email.trim()],
    );
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const profile = await this.db.one<ProfileRow>(
      `SELECT role::text AS role, full_name FROM public.profiles WHERE id = $1`,
      [user.id],
    );

    const role = (profile?.role as AppRole) || 'operador';
    const name = profile?.full_name?.trim() || user.full_name?.trim() || '';

    return {
      id: user.id,
      email: user.email,
      name,
      role,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, user };
  }

  async me(userId: string) {
    const user = await this.db.one<UserRow>(
      `SELECT id, email, password_hash, full_name FROM public.users WHERE id = $1`,
      [userId],
    );
    if (!user) throw new UnauthorizedException();
    const profile = await this.db.one<ProfileRow>(
      `SELECT role::text AS role, full_name FROM public.profiles WHERE id = $1`,
      [userId],
    );
    return {
      id: user.id,
      email: user.email,
      name: profile?.full_name?.trim() || user.full_name?.trim() || '',
      role: (profile?.role as AppRole) || 'operador',
    };
  }

  /** Alta de usuario (migración / bootstrap admin). */
  async createUser(input: {
    email: string;
    password: string;
    fullName?: string;
    role?: AppRole;
    id?: string;
    passwordHash?: string;
  }) {
    const existing = await this.db.one(
      `SELECT id FROM public.users WHERE lower(email) = lower($1)`,
      [input.email],
    );
    if (existing) throw new ConflictException('Email ya registrado');

    const hash =
      input.passwordHash || (await bcrypt.hash(input.password, 10));
    const meta = {
      role: input.role || 'operador',
      full_name: input.fullName || '',
    };

    const row = await this.db.one<UserRow>(
      `INSERT INTO public.users (id, email, password_hash, full_name, raw_user_meta_data, raw_app_meta_data)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING id, email, password_hash, full_name`,
      [
        input.id ?? null,
        input.email.trim().toLowerCase(),
        hash,
        input.fullName ?? null,
        JSON.stringify(meta),
        JSON.stringify({ role: input.role || 'operador' }),
      ],
    );
    if (!row) throw new ConflictException('No se pudo crear usuario');

    if (input.role && input.role !== 'operador') {
      // vendedor puede no existir aún en enum hasta migración 15; intentar
      try {
        await this.db.query(
          `UPDATE public.profiles SET role = $2::public.app_role, full_name = COALESCE($3, full_name) WHERE id = $1`,
          [row.id, input.role, input.fullName ?? null],
        );
      } catch {
        await this.db.query(
          `UPDATE public.profiles SET role = 'operador', full_name = COALESCE($2, full_name) WHERE id = $1`,
          [row.id, input.fullName ?? null],
        );
      }
    }

    return this.me(row.id);
  }
}
