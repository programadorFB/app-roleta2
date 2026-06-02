// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Ajuste o caminho se necessário

const ProtectedRoute = ({ children }) => {
    // Usamos o hook do nosso contexto de autenticação
    const { user, isLoading } = useAuth();
    const location = useLocation();

    // 1. Enquanto está verificando o usuário, exibimos um loading
    //    Isso evita um "flash" rápido da tela de login antes do redirecionamento
    if (isLoading) {
        return <div>Carregando...</div>;
    }

    // 2. Se a verificação terminou e NÃO há usuário, redireciona para o login
    if (!user) {
        // Guardamos a página que o usuário tentou acessar para redirecioná-lo de volta depois do login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 3. Se a verificação terminou e HÁ um usuário, renderiza a página solicitada
    return children;
};

export default ProtectedRoute;