import { it, expect, describe, beforeEach } from 'vitest';

import { createLogger } from '../../../src/utils/logger';
import { contextProvider } from '../../../src/context/provider';
import { createExecutionContext } from '../../../src/context/builder';
import { BlueGreenDeployment } from '../../../src/patterns/deployment/blue-green';
import { RollingUpdateDeployment } from '../../../src/patterns/deployment/rolling-update';

describe('Pattern Context Usage', () => {
  beforeEach(() => {
    // Set up a valid execution context
    const context = createExecutionContext({
      recipeId: 'test-recipe',
      taskId: 'test-task',
      logger: createLogger()
    });
    contextProvider.enterWith(context);
  });

  describe('BlueGreenDeployment', () => {
    it('should use setState and getState correctly', async () => {
      const deployment = new BlueGreenDeployment({
        service: 'test-service',
        healthCheckUrl: 'http://test.com/health',
        switchStrategy: 'loadbalancer'
      });

      const recipe = deployment.build();
      const tasks = Array.from(recipe.tasks.values());
      const createGreenTask = tasks.find(t => t.id === 'create-green-test-service');
      
      expect(createGreenTask).toBeDefined();
      
      // Execute the task handler
      await createGreenTask!.handler(contextProvider.getTaskContext());
      
      // Check that state was set correctly
      const greenEnv = contextProvider.getState('green_environment');
      expect(greenEnv).toBeDefined();
      expect(greenEnv.name).toBe('test-service-green');
      expect(greenEnv.created_at).toBeDefined();
    });

    it('should retrieve state in deploy task', async () => {
      const deployment = new BlueGreenDeployment({
        service: 'test-service',
        healthCheckUrl: 'http://test.com/health',
        switchStrategy: 'loadbalancer'
      });

      const recipe = deployment.build();
      
      // First set the green environment state
      contextProvider.setState('green_environment', {
        name: 'test-service-green',
        created_at: new Date().toISOString()
      });
      
      const deployTasks = Array.from(recipe.tasks.values());
      const deployTask = deployTasks.find(t => t.id === 'deploy-to-green-test-service');
      expect(deployTask).toBeDefined();
      
      // Execute the task - it should use getState to retrieve the green environment
      await deployTask!.handler(contextProvider.getTaskContext());
      
      // No error should be thrown
    });
  });

  describe('RollingUpdateDeployment', () => {
    it('should use setState correctly', async () => {
      const deployment = new RollingUpdateDeployment({
        service: 'test-service',
        maxSurge: 1,
        maxUnavailable: 1
      });

      const recipe = deployment.build();
      const validateConfigTask = recipe.tasks.find(t => t.id === 'validate-configuration');
      
      expect(validateConfigTask).toBeDefined();
      
      // Execute the task handler
      await validateConfigTask!.handler(contextProvider.getTaskContext());
      
      // Check that state was set correctly
      const deploymentConfig = contextProvider.getState('deployment_config');
      expect(deploymentConfig).toBeDefined();
      expect(deploymentConfig.service).toBe('test-service');
      expect(deploymentConfig.maxSurge).toBe(1);
      expect(deploymentConfig.maxUnavailable).toBe(1);
      expect(deploymentConfig.updateStrategy).toBe('sequential');
    });

    it('should store cluster health state', async () => {
      const deployment = new RollingUpdateDeployment({
        service: 'test-service',
        maxSurge: 1,
        maxUnavailable: 1
      });

      const recipe = deployment.build();
      const checkHealthTask = recipe.tasks.find(t => t.id === 'check-cluster-health');
      
      expect(checkHealthTask).toBeDefined();
      
      // Execute the task handler
      await checkHealthTask!.handler(contextProvider.getTaskContext());
      
      // Check that state was set correctly
      const clusterHealth = contextProvider.getState('cluster_health');
      expect(clusterHealth).toBeDefined();
      expect(clusterHealth.nodes).toBe('healthy');
      expect(clusterHealth.resources).toBe('sufficient');
      expect(clusterHealth.services).toBe('running');
    });
  });

  afterEach(() => {
    // Clear the context
    contextProvider.clearState();
  });
});