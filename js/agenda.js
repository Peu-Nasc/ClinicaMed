import { clinicaState } from './state.js';
import { showToast, comEstadoDeCarregamento, escapeHTML, confirmarAcao } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from './firebase.js';

const appointmentTimes = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

// Retorna o bloqueio (folga/indisponibilidade) que cobre esse profissional+data+horário, se existir
function obterBloqueio(profId, data, hora) {
    return clinicaState.agenda.bloqueios.find(b => {
        if (String(b.profId) !== String(profId) || b.data !== data) return false;
        if (b.tipo === 'dia_inteiro') return true;
        return hora >= b.horaInicio && hora <= b.horaFim;
    });
}

export function verificarAlertasAgendamento() {
    const getIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const hojeIso = getIsoDate(new Date());
    const amanhaObj = new Date();
    amanhaObj.setDate(amanhaObj.getDate() + 1);
    const amanhaIso = getIsoDate(amanhaObj);

    const consultasHoje = clinicaState.agenda.agendamentos.filter(a => a.data === hojeIso && a.status !== 'cancelado');
    const consultasAmanha = clinicaState.agenda.agendamentos.filter(a => a.data === amanhaIso && a.status !== 'cancelado');

    if (consultasHoje.length > 0) {
        showToast(`Você tem ${consultasHoje.length} consulta(s) agendada(s) para hoje.`, 'warning');
    }
    if (consultasAmanha.length > 0) {
        showToast(`Você tem ${consultasAmanha.length} consulta(s) agendada(s) para amanhã.`, 'warning');
    }
}

export function initAgenda() {
    const modalAgenda = document.getElementById('modal-agendamento');
    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');
    
    inputDataAgenda.value = new Date().toISOString().split('T')[0];
    
    document.getElementById('btn-novo-agendamento').addEventListener('click', () => abrirModalAgendamento());
    document.getElementById('btn-close-agendamento').addEventListener('click', () => modalAgenda.classList.remove('active'));
    
    inputDataAgenda.addEventListener('change', atualizarAgenda);
    filtroProfissional.addEventListener('change', atualizarAgenda);

    // ==========================================
    // BLOQUEIO DE HORÁRIO / FOLGA
    // ==========================================
    const modalBloqueio = document.getElementById('modal-bloqueio');
    const selectTipoBloqueio = document.getElementById('bloqueio-tipo');
    const grupoHorarioEspecifico = document.getElementById('bloqueio-horario-especifico-group');

    document.getElementById('btn-novo-bloqueio').addEventListener('click', () => abrirModalBloqueio());
    document.getElementById('btn-close-bloqueio').addEventListener('click', () => modalBloqueio.classList.remove('active'));

    selectTipoBloqueio.addEventListener('change', (e) => {
        grupoHorarioEspecifico.style.display = e.target.value === 'horario' ? 'grid' : 'none';
    });

    document.getElementById('form-bloqueio').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSalvar = e.target.querySelector('button[type="submit"]');

        await comEstadoDeCarregamento(btnSalvar, 'Bloqueando...', async () => {
            const profId = document.getElementById('bloqueio-profissional').value;
            const data = document.getElementById('bloqueio-data').value;
            const tipo = selectTipoBloqueio.value;
            const horaInicio = tipo === 'horario' ? document.getElementById('bloqueio-hora-inicio').value : null;
            const horaFim = tipo === 'horario' ? document.getElementById('bloqueio-hora-fim').value : null;

            if (tipo === 'horario' && horaInicio > horaFim) {
                showToast('O horário de início não pode ser depois do horário de fim.', 'error');
                return;
            }

            // Impede bloquear em cima de consulta já marcada
            const conflito = clinicaState.agenda.agendamentos.some(a => {
                if (a.profId !== String(profId) || a.data !== data) return false;
                if (tipo === 'dia_inteiro') return true;
                return a.hora >= horaInicio && a.hora <= horaFim;
            });

            if (conflito) {
                showToast('Já existe consulta marcada nesse período. Cancele a consulta antes de bloquear o horário.', 'error');
                return;
            }

            try {
                await addDoc(collection(db, "bloqueios_agenda"), {
                    profId: String(profId),
                    data,
                    tipo,
                    horaInicio,
                    horaFim,
                    motivo: document.getElementById('bloqueio-motivo').value,
                    clinicaId: clinicaState.sessao.clinicaId
                });

                modalBloqueio.classList.remove('active');
                e.target.reset();
                grupoHorarioEspecifico.style.display = 'none';
                showToast('Horário bloqueado com sucesso.', 'success');

                await carregarBloqueios();
            } catch (error) {
                console.error("Erro ao bloquear horário: ", error);
                showToast('Falha de conexão ao bloquear horário.', 'error');
            }
        });
    });

    document.getElementById('form-agendamento').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');

        await comEstadoDeCarregamento(btnSalvar, 'Agendando...', async () => {
            const pacId = document.getElementById('agenda-paciente').value;
            const profId = document.getElementById('agenda-profissional').value;
            const dataAgendamento = document.getElementById('agenda-data').value;
            const horaAgendamento = document.getElementById('agenda-hora').value;
            const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacId));

            // SISTEMA DE BLOQUEIO (Impede choque de horários)
            // Consultas com status "cancelado" não ocupam mais o horário -
            // o cancelamento agora é um status (não apaga o registro), então
            // é preciso ignorá-las explicitamente para liberar o slot de novo.
            const horarioOcupado = clinicaState.agenda.agendamentos.find(a => 
                a.profId === String(profId) && 
                a.data === dataAgendamento && 
                a.hora === horaAgendamento &&
                a.status !== 'cancelado'
            );

            if (horarioOcupado) {
                showToast('Atenção: Este médico já possui um paciente agendado neste horário!', 'error');
                return; 
            }

            const bloqueio = obterBloqueio(profId, dataAgendamento, horaAgendamento);
            if (bloqueio) {
                showToast('Este horário está bloqueado (folga/indisponibilidade) para este profissional.', 'error');
                return;
            }

            try {
                await addDoc(collection(db, "agendamentos"), {
                    pacId: String(pacId),
                    pacNome: paciente ? paciente.nome : 'Paciente',
                    profId: String(profId),
                    data: dataAgendamento,
                    hora: horaAgendamento,
                    tipo: document.getElementById('agenda-tipo').value,
                    status: 'agendado', 
                    clinicaId: clinicaState.sessao.clinicaId
                });
                
                modalAgenda.classList.remove('active');
                e.target.reset();
                showToast('Consulta agendada com sucesso!', 'success');
                
                await carregarAgendamentos(); 
            } catch (error) {
                console.error("Erro ao agendar: ", error);
                showToast('Falha de conexão ao agendar.', 'error');
            }
        });
    });

    let agendamentoIdParaAtualizar = null;

    const modalConfirmarAgendamento = document.getElementById('modal-confirmar-agendamento');
    const modalCancelarAgendamento = document.getElementById('modal-cancelar-agendamento');

    function fecharModaisDeStatus() {
        modalConfirmarAgendamento.classList.remove('active');
        modalCancelarAgendamento.classList.remove('active');
        agendamentoIdParaAtualizar = null;
        // Reconstrói a agenda a partir do estado atual (que não mudou),
        // pra desfazer visualmente a seleção do <select> se o usuário
        // fechar o modal sem confirmar.
        atualizarAgenda();
    }

    document.getElementById('btn-close-confirmar-agendamento').addEventListener('click', fecharModaisDeStatus);
    document.getElementById('btn-close-cancelar-agendamento').addEventListener('click', fecharModaisDeStatus);

    document.getElementById('form-confirmar-agendamento').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!agendamentoIdParaAtualizar) return;

        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const idAgendamento = agendamentoIdParaAtualizar;

        await comEstadoDeCarregamento(btnSalvar, 'Confirmando...', async () => {
            try {
                await updateDoc(doc(db, "agendamentos", idAgendamento), {
                    status: 'confirmado',
                    observacaoConfirmacao: {
                        whatsapp: document.getElementById('confirmacao-whatsapp').checked,
                        pagamento: document.getElementById('confirmacao-pagamento').checked,
                        chegou: document.getElementById('confirmacao-chegou').checked,
                        observacoes: document.getElementById('confirmacao-observacoes').value
                    }
                });
                showToast('Consulta confirmada!', 'success');
                modalConfirmarAgendamento.classList.remove('active');
                e.target.reset();
                agendamentoIdParaAtualizar = null;
                await carregarAgendamentos();
            } catch (error) {
                console.error("Erro ao confirmar consulta: ", error);
                showToast('Erro ao confirmar consulta.', 'error');
            }
        });
    });

    document.getElementById('form-cancelar-agendamento').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!agendamentoIdParaAtualizar) return;

        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const idAgendamento = agendamentoIdParaAtualizar;

        await comEstadoDeCarregamento(btnSalvar, 'Cancelando...', async () => {
            try {
                // Cancelar agora é uma mudança de status, não mais deleteDoc:
                // o registro precisa sobreviver para o histórico e para uma
                // futura auditoria. O horário fica livre para um novo
                // agendamento porque a busca de "horário ocupado" ignora
                // consultas com status "cancelado".
                await updateDoc(doc(db, "agendamentos", idAgendamento), {
                    status: 'cancelado',
                    motivoCancelamento: document.getElementById('cancelamento-motivo').value,
                    canceladoPor: clinicaState.sessao.nome,
                    canceladoEm: new Date().toISOString()
                });
                showToast('Consulta cancelada.', 'success');
                modalCancelarAgendamento.classList.remove('active');
                e.target.reset();
                agendamentoIdParaAtualizar = null;
                await carregarAgendamentos();
            } catch (error) {
                console.error("Erro ao cancelar consulta: ", error);
                showToast('Erro ao cancelar consulta.', 'error');
            }
        });
    });

    const agendaContainer = document.getElementById('agenda-professionals');
    if (agendaContainer) {
        agendaContainer.addEventListener('click', async (e) => {
            const btnRemoverBloqueio = e.target.closest('.btn-remover-bloqueio');
            if (btnRemoverBloqueio) {
                e.stopPropagation();
                if (await confirmarAcao('Deseja remover este bloqueio e liberar o horário?', { titulo: 'Remover bloqueio', textoConfirmar: 'Remover', perigoso: false })) {
                    const idBloqueio = btnRemoverBloqueio.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "bloqueios_agenda", idBloqueio));
                        showToast('Bloqueio removido.', 'success');
                        await carregarBloqueios();
                    } catch (error) {
                        console.error("Erro ao remover bloqueio: ", error);
                        showToast('Erro ao remover bloqueio.', 'error');
                    }
                }
            }
        });

        agendaContainer.addEventListener('change', async (e) => {
            if (e.target.classList.contains('select-status-agenda')) {
                const novoStatus = e.target.value;
                const idAgendamento = e.target.getAttribute('data-id');

                // Confirmado e Cancelado precisam de dados extras (observação
                // e motivo, respectivamente) - abrem modal em vez de salvar direto.
                if (novoStatus === 'confirmado') {
                    agendamentoIdParaAtualizar = idAgendamento;
                    document.getElementById('form-confirmar-agendamento').reset();
                    modalConfirmarAgendamento.classList.add('active');
                    return;
                }

                if (novoStatus === 'cancelado') {
                    agendamentoIdParaAtualizar = idAgendamento;
                    document.getElementById('form-cancelar-agendamento').reset();
                    modalCancelarAgendamento.classList.add('active');
                    return;
                }

                // Agendado / Aguardando Atendimento / Concluído: sem dados
                // extras, salva direto como já funcionava antes.
                try {
                    await updateDoc(doc(db, "agendamentos", idAgendamento), { status: novoStatus });
                    showToast('Status atualizado!', 'success');
                    await carregarAgendamentos(); 
                } catch (error) {
                    console.error("Erro ao atualizar status: ", error);
                    showToast('Erro ao atualizar.', 'error');
                }
            }
        });
    }
}

export function abrirModalAgendamento(hora = '', profId = '', data = '') {
    const modalAgenda = document.getElementById('modal-agendamento');
    const selPac = document.getElementById('agenda-paciente');
    const selProf = document.getElementById('agenda-profissional');
    const inputDataAgenda = document.getElementById('data-agenda');
    
    // === TRAVA DO DOUTOR: NOVO AGENDAMENTO ===
    let profsPermitidos = clinicaState.profissionais;
    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
    }

    selPac.innerHTML = clinicaState.pacientes.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`).join('');
    selProf.innerHTML = profsPermitidos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${escapeHTML(p.especialidade)})</option>`).join('');
    
    // Bloqueia visualmente o campo se for médico
    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        selProf.style.pointerEvents = 'none';
        selProf.style.backgroundColor = '#e2e8f0';
    } else {
        selProf.style.pointerEvents = 'auto';
        selProf.style.backgroundColor = '';
    }
    
    if(data) document.getElementById('agenda-data').value = data;
    else document.getElementById('agenda-data').value = inputDataAgenda.value;
    
    const selectHora = document.getElementById('agenda-hora');
    if(hora) selectHora.value = hora; 
    else selectHora.value = ""; 
    
    if(profId) selProf.value = profId;
    
    modalAgenda.classList.add('active');
}

export function abrirModalBloqueio() {
    const modalBloqueio = document.getElementById('modal-bloqueio');
    const selProf = document.getElementById('bloqueio-profissional');
    const inputDataAgenda = document.getElementById('data-agenda');

    // === TRAVA DO DOUTOR: SÓ PODE BLOQUEAR A PRÓPRIA AGENDA ===
    let profsPermitidos = clinicaState.profissionais;
    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
    }

    selProf.innerHTML = profsPermitidos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${escapeHTML(p.especialidade)})</option>`).join('');

    document.getElementById('bloqueio-data').value = inputDataAgenda.value;
    document.getElementById('bloqueio-tipo').value = 'dia_inteiro';
    document.getElementById('bloqueio-horario-especifico-group').style.display = 'none';

    modalBloqueio.classList.add('active');
}

export function atualizarAgenda() {
    const container = document.getElementById('agenda-professionals');
    const colHorarios = document.getElementById('time-column-slots');
    if (!container || !colHorarios) return;
    
    colHorarios.innerHTML = `<div class="time-slot-header">Horário</div>` + 
        appointmentTimes.map(h => `<div class="time-slot">${h}</div>`).join('');

    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');
    
    const dataSelecionada = inputDataAgenda.value;
    
    // === TRAVA DO DOUTOR: COLUNAS DA AGENDA ===
    let profsPermitidos = clinicaState.profissionais;
    let mostrarTodos = true;

    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
        mostrarTodos = false;
    }

    // Configura o Dropdown de Filtro da Tabela
    let opcoesFiltro = '';
    if (mostrarTodos) opcoesFiltro += `<option value="todos">Todos os Profissionais</option>`;
    opcoesFiltro += profsPermitidos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`).join('');
    
    // Mantém o valor anterior selecionado, se possível
    const valorAnterior = filtroProfissional.value;
    filtroProfissional.innerHTML = opcoesFiltro;
    if (mostrarTodos && valorAnterior) filtroProfissional.value = valorAnterior;
    
    container.innerHTML = '';
    let filtroAtual = filtroProfissional.value;
    
    const profsParaExibir = filtroAtual === 'todos' 
        ? profsPermitidos 
        : profsPermitidos.filter(p => p.id == filtroAtual);
        
    if (profsParaExibir.length === 0) {
        container.innerHTML = `
            <div class="professional-column empty-column">
                <div class="prof-header">
                    <strong>Sem Profissionais</strong>
                    <small>Seu usuário não está vinculado à lista de profissionais.</small>
                </div>
            </div>`;
        return;
    }
    
    profsParaExibir.forEach(prof => {
        const coluna = document.createElement('div');
        coluna.className = 'professional-column';
        coluna.innerHTML = `<div class="prof-header"><strong>${escapeHTML(prof.nome)}</strong><small>${escapeHTML(prof.especialidade)}</small></div>`;
        
        appointmentTimes.forEach(hora => {
            // Consultas canceladas não ocupam mais o slot - o horário
            // volta a ficar livre pra um novo agendamento, mas o registro
            // cancelado continua existindo no banco (não é mais deletado).
            const agendamento = clinicaState.agenda.agendamentos.find(a => 
                a.profId == prof.id && a.data === dataSelecionada && a.hora === hora && a.status !== 'cancelado'
            );
            
            const slot = document.createElement('div');
            if (agendamento) {
                    const statusAtual = agendamento.status || 'agendado';
                    slot.className = 'appointment-slot occupied';
                    slot.dataset.status = statusAtual; 
                    
                    slot.innerHTML = `
                        <div class="appt-slot-header">
                            <p class="patient-name">${escapeHTML(agendamento.pacNome)}</p>
                        </div>
                        <span class="appointment-type">${escapeHTML(agendamento.tipo || 'Consulta')}</span>
                        
                        <select class="select-status-agenda input-premium" data-id="${agendamento.id}">
                            <option value="agendado" ${statusAtual === 'agendado' ? 'selected' : ''}>🗓️ Agendado</option>
                            <option value="confirmado" ${statusAtual === 'confirmado' ? 'selected' : ''}>✅ Confirmado</option>
                            <option value="aguardando_atendimento" ${statusAtual === 'aguardando_atendimento' ? 'selected' : ''}>⏳ Aguardando Atendimento</option>
                            <option value="concluido" ${statusAtual === 'concluido' ? 'selected' : ''}>🏁 Concluído</option>
                            <option value="cancelado" ${statusAtual === 'cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                        </select>
                    `;
            } else {
                const bloqueio = obterBloqueio(prof.id, dataSelecionada, hora);
                if (bloqueio) {
                    slot.className = 'appointment-slot blocked';
                    slot.innerHTML = `
                        <div class="appt-slot-header">
                            <span class="blocked-label"><i class="fa-solid fa-lock"></i> ${bloqueio.tipo === 'dia_inteiro' ? 'Folga (Dia Inteiro)' : 'Bloqueado'}</span>
                            <button class="appt-cancel-btn btn-remover-bloqueio" data-id="${bloqueio.id}" title="Remover bloqueio"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        ${bloqueio.motivo ? `<span class="appointment-type">${escapeHTML(bloqueio.motivo)}</span>` : ''}
                    `;
                } else {
                    slot.className = 'appointment-slot empty';
                    slot.textContent = 'Horário Livre';
                    slot.addEventListener('click', () => abrirModalAgendamento(hora, prof.id, dataSelecionada));
                }
            }
            coluna.appendChild(slot);
        });
        container.appendChild(coluna);
    });
}

export async function carregarBloqueios() {
    try {
        const q = query(
            collection(db, "bloqueios_agenda"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        clinicaState.agenda.bloqueios = [];

        querySnapshot.forEach((doc) => {
            clinicaState.agenda.bloqueios.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });

        atualizarAgenda();

    } catch (error) {
        console.error("Erro ao buscar bloqueios da agenda: ", error);
        showToast('Erro ao carregar bloqueios de horário.', 'error');
    }
}
export async function carregarAgendamentos() {
    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.agenda.agendamentos = [];
                  
        querySnapshot.forEach((doc) => {
            clinicaState.agenda.agendamentos.push({
                ...doc.data(),
                id: String(doc.id) 
            });
        });
        
        atualizarAgenda(); 
             
    } catch (error) {
        console.error("Erro ao buscar agenda: ", error);
        showToast('Erro ao carregar agendamentos.', 'error');
    }
}