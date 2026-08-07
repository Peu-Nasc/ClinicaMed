import { initAuth } from './login.js';
import { initUI } from './NavMenu.js';
import { initMasks, initConfirmacao, initFooterInstitucional } from './Ferramentas.js';
import { initPacientes, atualizarTabelaPacientes, carregarPacientes } from './pacientes.js';
import { initFinanceiro, calcularDRE, atualizarTabelaFinanceiro, atualizarTabelaCustosFixos } from './financeiro.js';
import { initEstoque, atualizarTabelaEstoque } from './estoque.js';
import { initAgenda, atualizarAgenda } from './agenda.js';
import { initNotificacoes } from './notificacoes.js';
import { initAuditoria } from './auditoria.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    initMasks();
    initUI();
    initConfirmacao();
    initFooterInstitucional();

    initPacientes();
    initFinanceiro();
    initEstoque();
    initAgenda();
    initNotificacoes();
    initAuditoria();

    calcularDRE();
    atualizarTabelaFinanceiro();
    atualizarTabelaCustosFixos();
    atualizarTabelaEstoque();
    atualizarAgenda();
});