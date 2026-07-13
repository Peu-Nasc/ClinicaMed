import { initAuth } from './login.js';
import { initUI } from './NavMenu.js';
import { initMasks } from './Ferramentas.js';
import { initPacientes, atualizarTabelaPacientes, carregarPacientes } from './pacientes.js';
import { initFinanceiro, calcularDRE, atualizarTabelaFinanceiro } from './financeiro.js';
import { initEstoque, atualizarTabelaEstoque } from './estoque.js';
import { initAgenda, atualizarAgenda } from './agenda.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    initMasks();
    initUI();

    initPacientes();
    initFinanceiro();
    initEstoque();
    initAgenda();

    calcularDRE();
    atualizarTabelaFinanceiro();
    atualizarTabelaEstoque();
    atualizarAgenda();
});