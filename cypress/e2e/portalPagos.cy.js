describe('Portal de Pagos UAM', () => {
  beforeEach(() => {
    cy.visit('/ponline/');
  });

  it('debe cargar correctamente el portal', () => {
    cy.title().should('eq', 'Portal de Pagos UAM');

    cy.contains('¡Bienvenido al portal de pagos!')
      .should('be.visible');

    cy.contains('Paga')
      .should('be.visible');

    cy.contains('FÁCIL Y RÁPIDO')
      .should('be.visible');
  });

  it('debe mostrar las opciones principales de pago', () => {
    const opcionesEsperadas = [
      'Pagar Matrícula',
      'Pagar Otros Conceptos',
      'Pagar Cuota Financiación',
      'Certificados Académicos',
      'Educación Continuada',
      'Instituto de Idiomas',
      'Congresos',
      'Pago concepto RREDSI'
    ];

    cy.get('#opciones').scrollIntoView();

    // El portal usa enlaces con apariencia de botón para las opciones de pago.
    cy.get('#opciones a[role="button"]', { timeout: 10000 })
      .should(($enlaces) => {
        const textosEnlaces = [...$enlaces].map((enlace) =>
          enlace.innerText
            .replace(/\s+/g, ' ')
            .trim()
        );

        opcionesEsperadas.forEach((opcion) => {
          expect(textosEnlaces, 'opciones principales de pago').to.include(opcion);
          expect($enlaces.eq(textosEnlaces.indexOf(opcion)), opcion)
            .to.be.visible;
        });
      });

    cy.screenshot('portal-con-opciones-de-pago');
  });
});
