const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://intrauam.autonoma.edu.co',

    specPattern: 'cypress/e2e/**/*.cy.js',

    supportFile: 'cypress/support/e2e.js',

    setupNodeEvents(on, config) {
      return config;
    }
  }
});