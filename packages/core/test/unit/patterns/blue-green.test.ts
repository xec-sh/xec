import { it, vi, expect, describe } from 'vitest';

import { BlueGreenOptions } from '../../../src/patterns/types';
import { blueGreen } from '../../../src/patterns/deployment/blue-green';

describe('patterns/deployment/blue-green', () => {
  it('should create a blue-green deployment pattern', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'dns',
      rollbackOnFailure: true,
    };

    const pattern = blueGreen(options);
    
    expect(pattern.name).toBe('blue-green');
    expect(pattern.category).toBe('deployment');
    expect(pattern.tags).toContain('zero-downtime');
  });

  it('should build a recipe with required phases', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'loadbalancer',
      healthCheckUrl: 'http://localhost:8080/health',
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    expect(recipe.metadata.name).toBe('blue-green-test-service');
    expect(recipe.phases).toBeDefined();
    
    const phaseNames = Array.from(recipe.phases.values()).map(p => p.name);
    expect(phaseNames).toContain('prepare-green');
    expect(phaseNames).toContain('validate-green');
    expect(phaseNames).toContain('switch-traffic');
    expect(phaseNames).toContain('monitor');
    expect(phaseNames).toContain('cleanup');
  });

  it('should add warmup phase when warmupTime is specified', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'service-mesh',
      warmupTime: 60,
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    const phaseNames = Array.from(recipe.phases.values()).map(p => p.name);
    expect(phaseNames).toContain('warmup-green');
  });

  it('should add validation steps when provided', () => {
    const mockTask = {
      name: 'custom-validation',
      description: 'Custom validation step',
      handler: vi.fn(),
      metadata: {},
    };

    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'dns',
      validationSteps: [mockTask],
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    const validatePhase = Array.from(recipe.phases.values()).find(p => p.name === 'validate-green');
    expect(validatePhase).toBeDefined();
    expect(validatePhase!.tasks.length).toBeGreaterThan(2); // health check + smoke tests + custom
  });

  it('should set rollback handler when rollbackOnFailure is true', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'loadbalancer',
      rollbackOnFailure: true,
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    expect(recipe.errorHandler).toBeDefined();
  });

  it('should support all switch strategies', () => {
    const strategies: Array<'dns' | 'loadbalancer' | 'service-mesh'> = ['dns', 'loadbalancer', 'service-mesh'];
    
    strategies.forEach(strategy => {
      const options: BlueGreenOptions = {
        service: 'test-service',
        switchStrategy: strategy,
      };

      const pattern = blueGreen(options);
      const recipe = pattern.build();
      
      expect(recipe).toBeDefined();
      expect(recipe.metadata.name).toBe('blue-green-test-service');
    });
  });

  it('should set proper phase dependencies', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'dns',
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    const validatePhase = Array.from(recipe.phases.values()).find(p => p.name === 'validate-green');
    expect(validatePhase?.dependsOn).toContain('prepare-green');
    
    const switchPhase = Array.from(recipe.phases.values()).find(p => p.name === 'switch-traffic');
    expect(switchPhase?.dependsOn).toContain('validate-green');
    
    const monitorPhase = Array.from(recipe.phases.values()).find(p => p.name === 'monitor');
    expect(monitorPhase?.dependsOn).toContain('switch-traffic');
  });

  it('should mark cleanup phase as optional', () => {
    const options: BlueGreenOptions = {
      service: 'test-service',
      switchStrategy: 'dns',
    };

    const pattern = blueGreen(options);
    const recipe = pattern.build();
    
    const cleanupPhase = Array.from(recipe.phases.values()).find(p => p.name === 'cleanup');
    expect(cleanupPhase?.optional).toBe(true);
  });
});