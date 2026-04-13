import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AUTH } from '../constants.js';

@Injectable()
export class AuthService {
    constructor(
        private userService: UsersService,
        private jwtService: JwtService    
    ){}

    async register(email: string, password: string){
        const hashedPassword = await bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);

        return this.userService.createUser({
            email,
            password: hashedPassword
        })
    }

    async login(email: string, password: string){        
        const user = await this.userService.findByEmail(email);
            
        if(!user) throw new UnauthorizedException('Invalid credentials');
            
        const passMatch = await bcrypt.compare(password, user.password);
            
        if(!passMatch) throw new UnauthorizedException('Invalid credentials');
            
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role
        }
            
        const token = await this.jwtService.signAsync(payload);
        
        return {
            access_token: token 
        }
    }

    async getSignedToken(videoId: string, userId: string){
        const token = this.jwtService.sign({
            videoId,
            sub: userId
        },
        {
            expiresIn: AUTH.TOKEN_EXPIRY
        })

        return token;
    }

    async validate(token: string) {  return this.jwtService.verify(token)}
}
