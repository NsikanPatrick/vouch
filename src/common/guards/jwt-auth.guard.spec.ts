import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
    let guard: JwtAuthGuard;
    let reflector: Reflector;

    const mockReflector = {
        getAllAndOverride: jest.fn(),
    };

    beforeEach(() => {
        reflector = mockReflector as any;
        guard = new JwtAuthGuard(reflector);
    });

    const createMockContext = (isPublic = false) => ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
            getRequest: () => ({}),
        }),
    } as ExecutionContext);

    it('should allow access for public routes', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue(true);
        const context = createMockContext(true);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
    });

    it('should call super.canActivate for protected routes', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue(false);
        const context = createMockContext(false);

        // Mock the super.canActivate method
        const superCanActivate = jest.spyOn(JwtAuthGuard.prototype as any, 'canActivate');
        superCanActivate.mockResolvedValue(true);

        // Act
        guard.canActivate(context);

        // Assert
        expect(superCanActivate).toHaveBeenCalled();
    });
});