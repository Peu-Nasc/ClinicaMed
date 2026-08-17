import { clinicaState } from './state.js';
import { formatCurrency, showToast, renderCardGrid, comEstadoDeCarregamento, escapeHTML, confirmarAcao, aplicarMascaraMoeda } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from './firebase.js';
import { registrarAuditoria } from './auditoria.js';

// ========================================================
// TABELA DE PROCEDIMENTOS
// Cadastro central de valores por tipo de atendimento - hoje usado na
// Agenda (pra ninguém digitar preço na mão ao marcar consulta) e serve
// de base pro Financeiro. Só o Administrador cadastra/edita valores
// (ver aplicarPermissoesDeTela em login.js); os demais perfis só
// consomem essa lista onde for preciso.
//
// Cada procedimento tem um valor base pra clínica inteira, com a opção
// de cadastrar "exceções" - valores diferentes pra profissionais
// específicos, pra quando um especialista cobra diferente do padrão.
// ========================================================

let procedimentoEmEdicaoId = null;
let contadorLinhaExcecao = 0;

export function initProcedimentos() {
    renderCardGrid('proc-mini-dash', [
        { id: 'proc-stat-total', label: 'Procedimentos Cadastrados', initial: '0', variant: 'primary' },
        { id: 'proc-stat-media', label: 'Valor Médio', initial: 'R$ 0,00', variant: 'success', valueClass: 'positivo' }
    ]);

    const modal = document.getElementById('modal-procedimento');
    const btnAbrir = document.getElementById('btn-abrir-modal-procedimento');
    const btnFechar = document.getElementById('btn-close-procedimento');

    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => {
            limparListaExcecoes();
            modal.classList.add('active');
        });
    }

    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            modal.classList.remove('active');
            fecharFormularioProcedimento();
        });
    }

    const btnAddExcecao = document.getElementById('btn-add-excecao-proc');
    if (btnAddExcecao) {
        btnAddExcecao.addEventListener('click', () => adicionarLinhaExcecao());
    }

    const search = document.getElementById('search-procedimentos');
    if (search) {
        search.addEventListener('input', (e) => atualizarTabelaProcedimentos(e.target.value.toLowerCase()));
    }

    const form = document.getElementById('form-procedimento');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSalvar = e.target.querySelector('button[type="submit"]');

            await comEstadoDeCarregamento(btnSalvar, 'Salvando...', async () => {
                const valorBaseTexto = document.getElementById('proc-valor').value.replace(/\./g, '').replace(',', '.');

                if (!valorBaseTexto || parseFloat(valorBaseTexto) <= 0) {
                    showToast('Informe um valor base válido.', 'error');
                    return;
                }

                const excecoes = lerExcecoesDoFormulario();
                // Um profissional não pode aparecer duas vezes na lista de exceções
                // do mesmo procedimento - evitaria ambiguidade sobre qual valor vale.
                const idsRepetidos = excecoes.map(x => x.profissionalId).filter((id, i, arr) => arr.indexOf(id) !== i);
                if (idsRepetidos.length > 0) {
                    showToast('Há um profissional repetido nas exceções de valor.', 'error');
                    return;
                }

                const dadosParaSalvar = {
                    nome: document.getElementById('proc-nome').value,
                    categoria: document.getElementById('proc-categoria').value,
                    valorBase: parseFloat(valorBaseTexto),
                    excecoes,
                    clinicaId: clinicaState.sessao.clinicaId
                };

                try {
                    if (procedimentoEmEdicaoId) {
                        // Valida se o documento existe antes de atualizar
                        const docRef = doc(db, "procedimentos", procedimentoEmEdicaoId);
                        const docSnap = await getDoc(docRef);
                        if (!docSnap.exists()) {
                            showToast('Este procedimento foi removido por outro usuário.', 'warning');
                            await carregarProcedimentos();
                            return;
                        }
                        await updateDoc(docRef, dadosParaSalvar);
                        showToast('Procedimento atualizado com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Edição', modulo: 'Procedimentos', descricao: `Procedimento atualizado: ${dadosParaSalvar.nome} (${formatCurrency(dadosParaSalvar.valorBase)})` });
                    } else {
                        await addDoc(collection(db, "procedimentos"), dadosParaSalvar);
                        showToast('Procedimento cadastrado com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Criação', modulo: 'Procedimentos', descricao: `Novo procedimento: ${dadosParaSalvar.nome} (${formatCurrency(dadosParaSalvar.valorBase)})` });
                    }

                    modal.classList.remove('active');
                    fecharFormularioProcedimento();
                    await carregarProcedimentos();
                } catch (error) {
                    console.error("Erro ao salvar procedimento: ", error);
                    showToast('Falha ao salvar o procedimento.', 'error');
                }
            });
        });
    }

    const corpoTabela = document.getElementById('procedimentos-table-body');
    if (corpoTabela) {
        corpoTabela.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-proc');
            const btnExcluir = e.target.closest('.btn-excluir-proc');

            if (btnExcluir) {
                const id = btnExcluir.getAttribute('data-id');
                if (await confirmarAcao('Deseja realmente excluir este procedimento da tabela? Ele deixará de aparecer como opção na Agenda.', { titulo: 'Excluir procedimento', textoConfirmar: 'Excluir' })) {
                    const excluido = clinicaState.procedimentos.find(p => String(p.id) === String(id));
                    try {
                        await deleteDoc(doc(db, "procedimentos", id));
                        showToast('Procedimento excluído com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Exclusão', modulo: 'Procedimentos', descricao: `Procedimento excluído: ${excluido ? excluido.nome : id}` });
                        await carregarProcedimentos();
                    } catch (error) {
                        console.error("Erro ao excluir procedimento: ", error);
                        showToast('Falha ao excluir o procedimento.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const id = btnEditar.getAttribute('data-id');
                const item = clinicaState.procedimentos.find(p => String(p.id) === String(id));
                if (item) abrirFormularioParaEdicao(item);
            }
        });
    }
}

function fecharFormularioProcedimento() {
    procedimentoEmEdicaoId = null;
    document.getElementById('form-procedimento').reset();
    limparListaExcecoes();
}

function limparListaExcecoes() {
    const lista = document.getElementById('proc-excecoes-lista');
    if (lista) lista.innerHTML = '';
}

// Monta uma linha "Profissional + Valor + Remover" dentro do modal.
// valores pré-preenchidos são usados na edição de um procedimento existente.
function adicionarLinhaExcecao(profissionalIdSelecionado = '', valorPreenchido = '') {
    const lista = document.getElementById('proc-excecoes-lista');
    if (!lista) return;

    const linhaId = `proc-excecao-${contadorLinhaExcecao++}`;
    const linha = document.createElement('div');
    linha.className = 'flex-row gap-15 mb-10';
    linha.id = linhaId;
    linha.innerHTML = `
        <select class="input-premium excecao-profissional" style="flex: 2;">
            <option value="">Selecione o profissional...</option>
            ${clinicaState.profissionais.map(p => `<option value="${p.id}" ${String(p.id) === String(profissionalIdSelecionado) ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('')}
        </select>
        <input type="text" class="input-premium excecao-valor" placeholder="0,00" style="flex: 1;" value="${valorPreenchido}">
        <button type="button" class="btn-action btn-delete btn-remover-excecao" title="Remover exceção"><i class="fa-solid fa-xmark"></i></button>
    `;
    lista.appendChild(linha);

    aplicarMascaraMoeda(linha.querySelector('.excecao-valor'));
    linha.querySelector('.btn-remover-excecao').addEventListener('click', () => linha.remove());
}

function lerExcecoesDoFormulario() {
    const linhas = document.querySelectorAll('#proc-excecoes-lista > div');
    const excecoes = [];

    linhas.forEach(linha => {
        const selectProf = linha.querySelector('.excecao-profissional');
        const inputValor = linha.querySelector('.excecao-valor');
        const profissionalId = selectProf ? selectProf.value : '';
        const valorTexto = inputValor ? inputValor.value.replace(/\./g, '').replace(',', '.') : '';

        // Linha sem profissional escolhido ou sem valor preenchido é
        // ignorada (evita salvar exceção "vazia" se alguém só clicou em
        // Adicionar e mudou de ideia sem preencher).
        if (!profissionalId || !valorTexto || parseFloat(valorTexto) <= 0) return;

        const profissional = clinicaState.profissionais.find(p => String(p.id) === String(profissionalId));
        excecoes.push({
            profissionalId,
            profissionalNome: profissional ? profissional.nome : '',
            valor: parseFloat(valorTexto)
        });
    });

    return excecoes;
}

function abrirFormularioParaEdicao(item) {
    procedimentoEmEdicaoId = item.id;

    document.getElementById('proc-nome').value = item.nome;
    document.getElementById('proc-categoria').value = item.categoria;
    const valorBase = Number(item.valorBase) || 0;
    document.getElementById('proc-valor').value = valorBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    limparListaExcecoes();
    (item.excecoes || []).forEach(x => {
        const valorExcecao = Number(x.valor) || 0;
        adicionarLinhaExcecao(x.profissionalId, valorExcecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    });

    document.getElementById('modal-procedimento').classList.add('active');
}

export function atualizarTabelaProcedimentos(filtro = '') {
    const corpo = document.getElementById('procedimentos-table-body');
    if (!corpo) return;

    const filtrados = clinicaState.procedimentos.filter(p =>
        p.nome.toLowerCase().includes(filtro) ||
        (p.categoria || '').toLowerCase().includes(filtro)
    );

    corpo.innerHTML = filtrados.map(p => {
        const excecoes = p.excecoes || [];
        const textoExcecoes = excecoes.length === 0
            ? '<span style="color:#6C757D;">Nenhuma - valor único</span>'
            : excecoes.map(x => `${escapeHTML(x.profissionalNome)}: <strong>${formatCurrency(x.valor)}</strong>`).join('<br>');

        return `<tr>
            <td><strong>${escapeHTML(p.nome)}</strong></td>
            <td><span class="badge primary">${escapeHTML(p.categoria)}</span></td>
            <td class="positivo valor-lancamento">${formatCurrency(p.valorBase)}</td>
            <td><small>${textoExcecoes}</small></td>
            <td>
                <div class="row-actions">
                    <button class="btn-action btn-edit btn-editar-proc" data-id="${p.id}" title="Editar Procedimento">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete btn-excluir-proc" data-id="${p.id}" title="Excluir Procedimento">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (filtrados.length === 0) {
        corpo.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#6C757D; padding:20px;">Nenhum procedimento cadastrado ainda.</td></tr>';
    }

    const elTotal = document.getElementById('proc-stat-total');
    const elMedia = document.getElementById('proc-stat-media');
    if (elTotal) elTotal.textContent = clinicaState.procedimentos.length;
    if (elMedia) {
        const media = clinicaState.procedimentos.length > 0
            ? clinicaState.procedimentos.reduce((soma, p) => soma + p.valorBase, 0) / clinicaState.procedimentos.length
            : 0;
        elMedia.textContent = formatCurrency(media);
    }
}

// Utilitário pra outros módulos (Agenda) descobrirem o valor certo de um
// procedimento pra um profissional específico - aplica a exceção se
// existir, senão cai no valor base.
export function valorDoProcedimentoParaProfissional(procedimentoId, profissionalId) {
    const proc = clinicaState.procedimentos.find(p => String(p.id) === String(procedimentoId));
    if (!proc) return 0;

    const excecao = (proc.excecoes || []).find(x => String(x.profissionalId) === String(profissionalId));
    const valor = excecao ? excecao.valor : proc.valorBase;
    return Number(valor) || 0;
}

export async function carregarProcedimentos() {
    try {
        const q = query(
            collection(db, "procedimentos"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        clinicaState.procedimentos = [];
        querySnapshot.forEach((doc) => {
            clinicaState.procedimentos.push({ ...doc.data(), id: String(doc.id) });
        });

        clinicaState.procedimentos.sort((a, b) => a.nome.localeCompare(b.nome));

        atualizarTabelaProcedimentos();
    } catch (error) {
        console.error("Erro ao buscar procedimentos: ", error);
        showToast('Erro ao carregar a tabela de procedimentos.', 'error');
    }
}