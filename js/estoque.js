import { clinicaState } from './state.js';
import { showToast } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from './firebase.js';

let itemEmEdicaoId = null;

export function initEstoque() {
    const modalEstoque = document.getElementById('modal-estoque');
    
    document.getElementById('btn-abrir-modal-estoque').addEventListener('click', () => modalEstoque.classList.add('active'));
    document.getElementById('btn-close-estoque').addEventListener('click', () => {
        modalEstoque.classList.remove('active');
        itemEmEdicaoId = null; // Desliga a edição ao cancelar
        document.getElementById('form-estoque').reset();
    });
    
    document.getElementById('form-estoque').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
        btnSalvar.disabled = true;

        try {
            const dadosParaSalvar = {
                codigo: document.getElementById('est-codigo').value,
                nome: document.getElementById('est-nome').value,
                apresentacao: document.getElementById('est-apresentacao').value,
                anvisa: document.getElementById('est-anvisa').value,
                lote: document.getElementById('est-lote').value,
                validade: document.getElementById('est-validade').value,
                qtd: parseInt(document.getElementById('est-qtd').value),
                min: parseInt(document.getElementById('est-min').value),
                controle: document.getElementById('est-controle').value,
                clinicaId: clinicaState.sessao.clinicaId
            };

            if (itemEmEdicaoId) {
                await updateDoc(doc(db, "estoque", itemEmEdicaoId), dadosParaSalvar);
                showToast('Lote atualizado com sucesso.', 'success');
            } else {
                await addDoc(collection(db, "estoque"), dadosParaSalvar);
                showToast('Item registrado no estoque com sucesso.', 'success');
            }
            
            modalEstoque.classList.remove('active');
            e.target.reset();
            itemEmEdicaoId = null; // Desliga a chave
            
            await carregarEstoque(); 
            
        } catch (error) {
            console.error("Erro no estoque: ", error);
            showToast('Falha ao registrar item.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

export function verificarAlertasEstoque() {
    const hoje = new Date();
    clinicaState.estoque.forEach(item => {
        if (item.qtd <= item.min) showToast(`Alerta: ${item.nome} atingiu o estoque mínimo!`, 'warning');
        
        const diasVenc = Math.floor((new Date(item.validade) - hoje) / (1000 * 60 * 60 * 24));
        if (diasVenc <= 30 && diasVenc >= 0) showToast(`Lote ${item.lote} de ${item.nome} vence em ${diasVenc} dias!`, 'error');
        else if (diasVenc < 0) showToast(`Item Vencido: Lote ${item.lote} de ${item.nome}!`, 'error');
    });
}

export function atualizarTabelaEstoque() {
    document.getElementById('stock-table-body').innerHTML = clinicaState.estoque.map(i => {
        const isVencido = new Date(i.validade) < new Date();
        const badgeClass = i.qtd <= i.min || isVencido ? 'warning' : 'success';
        return `<tr>
            <td>${i.codigo}</td>
            <td><strong>${i.nome}</strong><br><small>${i.apresentacao} | ${i.controle}</small></td>
            <td>L: ${i.lote}<br><small>Val: ${i.validade}</small></td>
            <td><span class="badge ${badgeClass}">${i.qtd} un</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-action btn-editar-est" data-id="${i.id}" style="color: var(--primary-light); border-color: var(--primary-light);" title="Editar Lote">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-excluir-est" data-id="${i.id}" style="color: #dc3545; border-color: #dc3545;" title="Excluir Item">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

export async function carregarEstoque() {
    try {
        // Busca apenas os itens de estoque vinculados à clínica do usuário logado
        const q = query(
            collection(db, "estoque"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.estoque = [];
                  
        querySnapshot.forEach((doc) => {
            clinicaState.estoque.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });
        
        atualizarTabelaEstoque();
        verificarAlertasEstoque(); // Dispara os avisos de validade e quantidade mínima
             
    } catch (error) {
        console.error("Erro ao buscar dados do estoque: ", error);
        showToast('Erro ao carregar o inventário.', 'error');
    }
}

// === DELEGAÇÃO DE EVENTOS: EDITAR E EXCLUIR NO ESTOQUE ===
    const stockTableBody = document.getElementById('stock-table-body');
    if (stockTableBody) {
        stockTableBody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-est');
            const btnExcluir = e.target.closest('.btn-excluir-est');

            if (btnExcluir) {
                const idEst = btnExcluir.getAttribute('data-id');
                if (confirm('Atenção: Deseja realmente excluir este lote do inventário?')) {
                    try {
                        await deleteDoc(doc(db, "estoque", idEst));
                        showToast('Item excluído com sucesso.', 'success');
                        await carregarEstoque();
                    } catch (error) {
                        console.error("Erro ao excluir: ", error);
                        showToast('Falha ao excluir item.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const idEst = btnEditar.getAttribute('data-id');
                const item = clinicaState.estoque.find(i => String(i.id) === String(idEst));
                
                if (item) {
                    itemEmEdicaoId = item.id; // Liga a chave
                    
                    document.getElementById('est-codigo').value = item.codigo;
                    document.getElementById('est-nome').value = item.nome;
                    document.getElementById('est-apresentacao').value = item.apresentacao;
                    document.getElementById('est-anvisa').value = item.anvisa;
                    document.getElementById('est-lote').value = item.lote;
                    document.getElementById('est-validade').value = item.validade;
                    document.getElementById('est-qtd').value = item.qtd;
                    document.getElementById('est-min').value = item.min;
                    document.getElementById('est-controle').value = item.controle;
                    
                    modalEstoque.classList.add('active');
                }
            }
        });
    }