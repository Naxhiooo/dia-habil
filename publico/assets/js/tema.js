// Botón de tema claro/oscuro. Sin elección guardada, se sigue el tema del sistema.
(function () {
  var raiz = document.documentElement;
  var sistemaOscuro = function () { return window.matchMedia('(prefers-color-scheme: dark)').matches; };
  var actual = function () { return raiz.dataset.tema || (sistemaOscuro() ? 'oscuro' : 'claro'); };

  function actualizar(boton) {
    var oscuro = actual() === 'oscuro';
    boton.setAttribute('aria-pressed', String(oscuro));
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  }

  document.querySelectorAll('[data-tema-boton]').forEach(function (boton) {
    actualizar(boton);
    boton.addEventListener('click', function () {
      var nuevo = actual() === 'oscuro' ? 'claro' : 'oscuro';
      raiz.dataset.tema = nuevo;
      try { localStorage.setItem('tema', nuevo); } catch (e) { /* almacenamiento bloqueado: el cambio dura esta visita */ }
      actualizar(boton);
    });
  });
})();
