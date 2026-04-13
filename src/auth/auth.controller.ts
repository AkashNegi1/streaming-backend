import { Controller, Body, Post, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AUTH } from '../constants.js';

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService){}

    @Post('register')
    register(@Body() body: {email: string, password: string}){
        const { email, password } = body;

        if (!email || !password) {
            throw new BadRequestException('Email and password are required');
        }

        if (!isValidEmail(email)) {
            throw new BadRequestException('Invalid email format');
        }

        if (password.length < AUTH.MIN_PASSWORD_LENGTH) {
            throw new BadRequestException(`Password must be at least ${AUTH.MIN_PASSWORD_LENGTH} characters`);
        }

        return this.authService.register(email, password);
    }

    @Post('login')
    login(@Body() body: {email: string, password: string}){
        const { email, password } = body;

        if (!email || !password) {
            throw new BadRequestException('Email and password are required');
        }

        return this.authService.login(email, password);
    }
}
