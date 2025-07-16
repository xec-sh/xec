import * as path from 'path';
import { Recipe } from '@xec/core';
import { promises as fs } from 'fs';

import { getProjectRoot } from './project.js';

/**
 * Load a recipe by name from various locations
 */
export async function loadRecipe(recipeName: string): Promise<Recipe | null> {
  const searchPaths = await getRecipeSearchPaths();
  
  for (const searchPath of searchPaths) {
    const recipePath = path.join(searchPath, `${recipeName}.js`);
    try {
      await fs.access(recipePath);
      const module = await import(recipePath);
      
      if (module.default && typeof module.default === 'object' && 'id' in module.default && 'name' in module.default && 'tasks' in module.default) {
        return module.default as Recipe;
      } else if (module.recipe && typeof module.recipe === 'object' && 'id' in module.recipe && 'name' in module.recipe && 'tasks' in module.recipe) {
        return module.recipe as Recipe;
      } else if (typeof module.default === 'function') {
        // Function that returns a recipe
        const result = await module.default();
        if (result && typeof result === 'object' && 'id' in result && 'name' in result && 'tasks' in result) {
          return result as Recipe;
        }
      }
    } catch {
      // Try next path
    }
  }
  
  return null;
}

/**
 * Get all search paths for recipes
 */
export async function getRecipeSearchPaths(): Promise<string[]> {
  const paths: string[] = [];
  
  try {
    const projectRoot = await getProjectRoot();
    
    // Project-specific paths
    paths.push(path.join(projectRoot, '.xec', 'recipes'));
    paths.push(path.join(projectRoot, 'recipes'));
    
    // Current directory
    paths.push(path.join(process.cwd(), 'recipes'));
    
  } catch {
    // If not in a project, just use current directory
    paths.push(path.join(process.cwd(), 'recipes'));
  }
  
  // Filter out duplicates
  return [...new Set(paths)];
}

/**
 * List all available recipes
 */
export async function listRecipes(): Promise<string[]> {
  const searchPaths = await getRecipeSearchPaths();
  const recipes = new Set<string>();
  
  for (const searchPath of searchPaths) {
    try {
      const files = await fs.readdir(searchPath);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          recipes.add(file.replace(/\.(js|ts)$/, ''));
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }
  
  return Array.from(recipes).sort();
}