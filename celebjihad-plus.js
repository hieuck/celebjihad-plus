// ==UserScript==
// @name         Auto Participate in Giveaway with Notification
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Tự động tham gia giveaway trên CelebJihad nếu chưa tham gia và hiển thị thông báo khi thành công
// @match        https://celebjihad.live/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let hasJoined = false;  // Cờ kiểm tra đã tham gia trong phiên hiện tại

    // Hàm hiển thị thông báo
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.innerHTML = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = 'black';
        notification.style.color = 'white';
        notification.style.padding = '10px';
        notification.style.borderRadius = '5px';
        notification.style.boxShadow = '0px 0px 10px rgba(0, 0, 0, 0.5)';
        notification.style.zIndex = '1000';
        document.body.appendChild(notification);

        // Tự động xóa thông báo sau 2 giây
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    // Hàm kiểm tra trạng thái đã tham gia giveaway
    function hasEnteredGiveaway() {
        const enteredText = document.querySelector('.lottery-item .accept');
        return enteredText && enteredText.textContent.includes("You have entered the token giveaway!");
    }

    // Hàm mở phần giveaway nếu chưa mở
    function openGiveawaySection() {
        const openButton = document.querySelector('.lottery .a11y-button.lottery-title-wrapper');
        if (openButton && !document.querySelector('.btn-auth-banner')) {
            openButton.click();  // Nhấp để mở phần giveaway
            console.log("Đã mở phần giveaway.");
        }
    }

    // Hàm nhấp vào nút "Participate in Giveaway" nếu chưa tham gia
    function clickParticipateButton() {
        const participateButton = document.querySelector('.btn-auth-banner');
        if (participateButton) {
            participateButton.click();
            console.log("Đã tham gia giveaway!");
            hasJoined = true; // Đánh dấu đã tham gia thành công
            showNotification("Bạn đã tham gia thành công giveaway!");  // Hiển thị thông báo thành công
        } else {
            console.log("Nút tham gia chưa xuất hiện hoặc đã tham gia.");
        }
    }

    // Kiểm tra và thực thi các bước mở và tham gia giveaway nếu chưa tham gia
    setInterval(() => {
        if (!hasEnteredGiveaway() && !hasJoined) {  // Chỉ mở và tham gia nếu chưa tham gia
            openGiveawaySection();    // Mở phần giveaway nếu cần
            clickParticipateButton(); // Thử tham gia giveaway
        } else if (hasJoined) {
            console.log("Bạn đã tham gia thành công và sẽ không tham gia lại trong phiên này.");
        } else {
            console.log("Đã tham gia trước đó.");
        }
    }, 5000);
})();
