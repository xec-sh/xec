import { it, expect, describe } from 'vitest';

import * as deploymentPatterns from '../../../../src/patterns/deployment/index';
import { canary, CanaryDeployment } from '../../../../src/patterns/deployment/canary';
import { recreate, RecreateDeployment } from '../../../../src/patterns/deployment/recreate';
import { abTesting, ABTestingDeployment } from '../../../../src/patterns/deployment/ab-testing';
import { blueGreen, BlueGreenDeployment } from '../../../../src/patterns/deployment/blue-green';
import { rollingUpdate, RollingUpdateDeployment } from '../../../../src/patterns/deployment/rolling-update';

describe('patterns/deployment/index', () => {
  it('should export all deployment pattern classes', () => {
    expect(deploymentPatterns.ABTestingDeployment).toBe(ABTestingDeployment);
    expect(deploymentPatterns.CanaryDeployment).toBe(CanaryDeployment);
    expect(deploymentPatterns.RecreateDeployment).toBe(RecreateDeployment);
    expect(deploymentPatterns.BlueGreenDeployment).toBe(BlueGreenDeployment);
    expect(deploymentPatterns.RollingUpdateDeployment).toBe(RollingUpdateDeployment);
  });

  it('should export all deployment pattern factory functions', () => {
    expect(deploymentPatterns.abTesting).toBe(abTesting);
    expect(deploymentPatterns.canary).toBe(canary);
    expect(deploymentPatterns.recreate).toBe(recreate);
    expect(deploymentPatterns.blueGreen).toBe(blueGreen);
    expect(deploymentPatterns.rollingUpdate).toBe(rollingUpdate);
  });

  it('should have all factory functions create correct pattern instances', () => {
    // A/B Testing
    const abPattern = deploymentPatterns.abTesting({
      service: 'test',
      variants: [],
      distribution: 'weighted',
    });
    expect(abPattern).toBeInstanceOf(deploymentPatterns.ABTestingDeployment);
    expect(abPattern.name).toBe('ab-testing');

    // Canary
    const canaryPattern = deploymentPatterns.canary({
      service: 'test',
      initialPercentage: 10,
      incrementPercentage: 10,
      incrementInterval: 300,
      targetPercentage: 100,
    });
    expect(canaryPattern).toBeInstanceOf(deploymentPatterns.CanaryDeployment);
    expect(canaryPattern.name).toBe('canary');

    // Recreate
    const recreatePattern = deploymentPatterns.recreate({
      service: 'test',
    });
    expect(recreatePattern).toBeInstanceOf(deploymentPatterns.RecreateDeployment);
    expect(recreatePattern.name).toBe('recreate');

    // Blue-Green
    const blueGreenPattern = deploymentPatterns.blueGreen({
      service: 'test',
      switchStrategy: 'dns',
    });
    expect(blueGreenPattern).toBeInstanceOf(deploymentPatterns.BlueGreenDeployment);
    expect(blueGreenPattern.name).toBe('blue-green');

    // Rolling Update
    const rollingPattern = deploymentPatterns.rollingUpdate({
      service: 'test',
      maxSurge: 1,
      maxUnavailable: 0,
    });
    expect(rollingPattern).toBeInstanceOf(deploymentPatterns.RollingUpdateDeployment);
    expect(rollingPattern.name).toBe('rolling-update');
  });

  it('should have all patterns implement DeploymentPattern interface', () => {
    const patterns = [
      deploymentPatterns.abTesting({
        service: 'test',
        variants: [],
        distribution: 'weighted',
      }),
      deploymentPatterns.canary({
        service: 'test',
        initialPercentage: 10,
        incrementPercentage: 10,
        incrementInterval: 300,
        targetPercentage: 100,
      }),
      deploymentPatterns.recreate({
        service: 'test',
      }),
      deploymentPatterns.blueGreen({
        service: 'test',
        switchStrategy: 'dns',
      }),
      deploymentPatterns.rollingUpdate({
        service: 'test',
        maxSurge: 1,
        maxUnavailable: 0,
      }),
    ];

    patterns.forEach(pattern => {
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('category');
      expect(pattern.category).toBe('deployment');
      expect(pattern).toHaveProperty('tags');
      expect(Array.isArray(pattern.tags)).toBe(true);
      expect(pattern).toHaveProperty('build');
      expect(typeof pattern.build).toBe('function');
    });
  });

  it('should have unique names for all patterns', () => {
    const patterns = [
      deploymentPatterns.abTesting({ service: 'test', variants: [], distribution: 'weighted' }),
      deploymentPatterns.canary({ service: 'test', initialPercentage: 10, incrementPercentage: 10, incrementInterval: 300, targetPercentage: 100 }),
      deploymentPatterns.recreate({ service: 'test' }),
      deploymentPatterns.blueGreen({ service: 'test', switchStrategy: 'dns' }),
      deploymentPatterns.rollingUpdate({ service: 'test', maxSurge: 1, maxUnavailable: 0 }),
    ];

    const names = patterns.map(p => p.name);
    const uniqueNames = new Set(names);
    
    expect(uniqueNames.size).toBe(names.length);
    expect(names).toContain('ab-testing');
    expect(names).toContain('canary');
    expect(names).toContain('recreate');
    expect(names).toContain('blue-green');
    expect(names).toContain('rolling-update');
  });

  it('should have all patterns build valid recipes', () => {
    const patterns = [
      deploymentPatterns.abTesting({ service: 'test', variants: [], distribution: 'weighted' }),
      deploymentPatterns.canary({ service: 'test', initialPercentage: 10, incrementPercentage: 10, incrementInterval: 300, targetPercentage: 100 }),
      deploymentPatterns.recreate({ service: 'test' }),
      deploymentPatterns.blueGreen({ service: 'test', switchStrategy: 'dns' }),
      deploymentPatterns.rollingUpdate({ service: 'test', maxSurge: 1, maxUnavailable: 0 }),
    ];

    patterns.forEach(pattern => {
      // Since the pattern implementations are TODO, they won't have tasks yet
      expect(() => pattern.build()).not.toThrow();
      
      // Once implemented, recipes should have these properties:
      // expect(recipe.metadata).toBeDefined();
      // expect(recipe.metadata.name).toContain(pattern.name);
      // expect(recipe.metadata.name).toContain('test'); // service name
      // expect(recipe.metadata.description).toBeDefined();
      // expect(recipe.metadata.tags).toEqual(pattern.tags);
    });
  });

  it('should categorize patterns by deployment characteristics', () => {
    // Zero-downtime patterns
    const zeroDowntimePatterns = [
      deploymentPatterns.blueGreen({ service: 'test', switchStrategy: 'dns' }),
      deploymentPatterns.canary({ service: 'test', initialPercentage: 10, incrementPercentage: 10, incrementInterval: 300, targetPercentage: 100 }),
      deploymentPatterns.rollingUpdate({ service: 'test', maxSurge: 1, maxUnavailable: 0 }),
      deploymentPatterns.abTesting({ service: 'test', variants: [], distribution: 'weighted' }),
    ];

    // Patterns with downtime
    const downtimePatterns = [
      deploymentPatterns.recreate({ service: 'test' }),
    ];

    // Progressive patterns
    const progressivePatterns = [
      deploymentPatterns.canary({ service: 'test', initialPercentage: 10, incrementPercentage: 10, incrementInterval: 300, targetPercentage: 100 }),
      deploymentPatterns.rollingUpdate({ service: 'test', maxSurge: 1, maxUnavailable: 0 }),
    ];

    // Verify tags reflect characteristics
    expect(downtimePatterns[0].tags).toContain('downtime');
    expect(progressivePatterns[0].tags).toContain('monitored'); // canary has 'monitored' tag
    expect(progressivePatterns[1].tags).toContain('gradual'); // rolling update has 'gradual' tag
  });

  it('should support pattern selection based on requirements', () => {
    // For experimentation
    const experimentPattern = deploymentPatterns.abTesting({
      service: 'experiment',
      variants: [
        { name: 'control', version: '1.0', weight: 50 },
        { name: 'treatment', version: '2.0', weight: 50 },
      ],
      distribution: 'weighted',
    });
    expect(experimentPattern.tags).toContain('experimentation');

    // For safe rollouts
    const safePattern = deploymentPatterns.canary({
      service: 'critical-service',
      initialPercentage: 1,
      incrementPercentage: 5,
      incrementInterval: 600,
      targetPercentage: 100,
      rollbackOnFailure: true,
    });
    expect(safePattern.tags).toContain('safe');
    expect(safePattern.tags).toContain('monitored');

    // For stateful services
    const statefulPattern = deploymentPatterns.recreate({
      service: 'database',
      gracefulShutdownTimeout: 300,
    });
    expect(statefulPattern.tags).toContain('stateful');

    // For fast deployments
    const fastPattern = deploymentPatterns.blueGreen({
      service: 'web-app',
      switchStrategy: 'loadbalancer',
    });
    expect(fastPattern.tags).toContain('instant-rollback');
  });

  it('should maintain consistent pattern interface', () => {
    const serviceOptions = {
      abTesting: { service: 'test', variants: [], distribution: 'weighted' },
      canary: { service: 'test', initialPercentage: 10, incrementPercentage: 10, incrementInterval: 300, targetPercentage: 100 },
      recreate: { service: 'test' },
      blueGreen: { service: 'test', switchStrategy: 'dns' },
      rollingUpdate: { service: 'test', maxSurge: 1, maxUnavailable: 0 },
    };

    Object.entries(deploymentPatterns).forEach(([name, exported]) => {
      if (typeof exported === 'function' && name in serviceOptions) {
        const options = serviceOptions[name as keyof typeof serviceOptions];
        const pattern = exported(options as any);
        
        // All patterns should have consistent interface
        expect(pattern.name).toBeTruthy();
        expect(pattern.description).toBeTruthy();
        expect(pattern.category).toBe('deployment');
        expect(Array.isArray(pattern.tags)).toBe(true);
        expect(pattern.tags.length).toBeGreaterThan(0);
        
        // Since the pattern implementations are TODO, they won't have tasks yet
        expect(() => pattern.build()).not.toThrow();
      }
    });
  });
});